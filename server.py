"""艺链本地展示版。Python 3.10+，仅标准库；非真实联盟链或支付系统。"""
import argparse
from contextlib import contextmanager
import base64
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'data' / 'yilian.sqlite3'
LOCK = threading.RLock()
PUBLIC = ROOT / 'public'

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def event(db, work_id, action, actor, payload):
    previous = db.execute('SELECT hash FROM events ORDER BY id DESC LIMIT 1').fetchone()
    record = {'work_id': work_id, 'action': action, 'actor': actor, 'payload': payload,
              'timestamp': now(), 'previous_hash': previous['hash'] if previous else '0' * 64}
    value = digest(record)
    db.execute('INSERT INTO events(work_id,action,actor,payload,timestamp,previous_hash,hash) VALUES(?,?,?,?,?,?,?)',
               (work_id, action, actor, json.dumps(payload, ensure_ascii=False, sort_keys=True), record['timestamp'], record['previous_hash'], value))
    return value

def init_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password TEXT,salt TEXT,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY,title TEXT NOT NULL,creator_id TEXT NOT NULL REFERENCES users(id),category TEXT NOT NULL,
          description TEXT NOT NULL,price INTEGER NOT NULL,supply INTEGER NOT NULL,image TEXT NOT NULL,content_hash TEXT NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,work_id TEXT NOT NULL REFERENCES works(id),action TEXT NOT NULL,
          actor TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,timestamp TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),work_id TEXT NOT NULL REFERENCES works(id),
          serial INTEGER NOT NULL,created TEXT NOT NULL,event_hash TEXT NOT NULL,UNIQUE(user_id,work_id),UNIQUE(work_id,serial));
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),work_id TEXT NOT NULL REFERENCES works(id),
          price INTEGER NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,collection_id TEXT REFERENCES collections(id));
        ''')
        if db.execute('SELECT count(*) FROM works').fetchone()[0]:
            return
        artists = [('artist-1', '山海造物'), ('artist-2', '林间工作室'), ('artist-3', '浮光计划')]
        for uid, name in artists:
            db.execute('INSERT INTO users(id,name,created) VALUES(?,?,?)', (uid, name, now()))
        seeds = [
            ('YL-001', '神奇的艺术', 'artist-1', '数字绘画', '原站展示作品。鲜明的色彩、重叠的眼睛与几何形状，将人物转化为富有想象力的数字图像。本地创作者名称、发行量及记录仅用于演示。', 162800, 99, 'item-1.jpg'),
            ('YL-002', '蓝海之痛', 'artist-2', '数字绘画', '原站展示作品。蓝白交织的笔触形成海洋般的层次，在细碎肌理之间感受色彩的流动。本地创作者名称、发行量及记录仅用于演示。', 199900, 128, 'item-3.jpg'),
            ('YL-003', '抽象', 'artist-3', '生成艺术', '原站展示作品。以抽象形态探索数字图像的表达空间，记录一次关于视觉与想象的实验。本地创作者名称、发行量及记录仅用于演示。', 88900, 66, 'item-4.jpg'),
            ('YL-004', '雨林', 'artist-1', '数字绘画', '原站展示作品。让自然意象走入数字空间，在层次与色彩间寻找属于自己的阅读方式。本地创作者名称、发行量及记录仅用于演示。', 136800, 200, 'item-5.jpg'),
            ('YL-005', '狮子王', 'artist-2', '数字绘画', '原站展示作品。通过富有表现力的造型，呈现数字艺术的多样面貌。本地创作者名称、发行量及记录仅用于演示。', 99800, 88, 'item-6.jpg'),
            ('YL-006', '驶向中心', 'artist-3', '生成艺术', '原站展示作品。用动态画面拓展静态收藏的边界，呈现不断变化的数字想象。本地创作者名称、发行量及记录仅用于演示。', 239800, 50, 'item-7.gif')]
        for wid, title, uid, category, description, price, supply, image in seeds:
            content_hash = hashlib.sha256((PUBLIC / 'img' / 'items' / image).read_bytes()).hexdigest()
            db.execute('INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?)', (wid,title,uid,category,description,price,supply,'/img/items/'+image,content_hash,now()))
            event(db, wid, 'PUBLISH', uid, {'title':title,'content_hash':content_hash,'supply':supply,'mode':'local-demo'})

def work_dict(db, row):
    w = dict(row)
    w['creator'] = db.execute('SELECT name FROM users WHERE id=?', (w['creator_id'],)).fetchone()[0]
    w['collected'] = db.execute('SELECT count(*) FROM collections WHERE work_id=?', (w['id'],)).fetchone()[0]
    w['remaining'] = w['supply'] - w['collected']
    w['record_hash'] = db.execute('SELECT hash FROM events WHERE work_id=? AND action=? ORDER BY id LIMIT 1', (w['id'],'PUBLISH')).fetchone()[0]
    return w

def history(db, wid):
    result = []
    for row in db.execute('SELECT e.*,u.name AS actor_name FROM events e JOIN users u ON u.id=e.actor WHERE work_id=? ORDER BY e.id', (wid,)):
        e = dict(row)
        e['payload'] = json.loads(e['payload'])
        result.append(e)
    return result

def verify_ledger(db):
    previous = '0'*64
    count = 0
    for row in db.execute('SELECT * FROM events ORDER BY id'):
        e = dict(row)
        expected = digest({k: json.loads(e[k]) if k=='payload' else e[k] for k in ['work_id','action','actor','payload','timestamp','previous_hash']})
        if e['previous_hash'] != previous or not hmac.compare_digest(e['hash'], expected):
            return {'valid':False, 'checked':count, 'failed_id':e['id']}
        previous = e['hash']
        count += 1
    return {'valid':True,'checked':count,'head':previous, 'mode':'local-demo'}

class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status

class Handler(BaseHTTPRequestHandler):
    server_version = 'YilianLocal/1.0'

    def log_message(self, fmt, *args):
        # Do not log cookies, uploaded artwork, or account information.
        pass

    def respond(self, value, status=200, cookies=None):
        raw = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.common_headers('application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        if cookies:
            self.send_header('Set-Cookie', cookies)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def common_headers(self, mime):
        self.send_header('Content-Type', mime)
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")

    def session(self, db, required=True):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie',''))
            token = cookie['yl_session'].value if 'yl_session' in cookie else ''
        except Exception:
            token = ''
        row = db.execute('SELECT s.*,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', (token,int(time.time()))).fetchone()
        if required and not row:
            raise ApiError('请先开启演示身份，或注册 / 登录后继续。',401)
        return dict(row) if row else None

    def new_session(self, db, user_id):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        db.execute('DELETE FROM sessions WHERE expires<?',(int(time.time()),))
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(token,user_id,csrf,int(time.time())+86400*7))
        return f'yl_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'

    def do_GET(self):
        try:
            url = urlsplit(self.path)
            legacy = {'grid-listing-1.html':'explore','detail-page.html':'detail?id=YL-002','become-author.html':'create',
                      'upload-artwork.html':'create','author.html':'collection','login.html':'login','register.html':'register',
                      'author-edit-profile.html':'collection','account-settings.html':'collection','connect-wallet.html':'about',
                      'help.html':'about','contacts.html':'about','blog.html':'about','blog-no-sidebar.html':'about',
                      'blog-post.html':'about','blog-post-no-sidebar.html':'about','index-2.html':'home',
                      'index-logged in.html':'home','pricing-tables-1.html':'about','pricing-tables-2.html':'about','pricing-tables-3.html':'about'}
            legacy_key = unquote(url.path).lstrip('/')
            if legacy_key in legacy:
                self.send_response(302)
                self.send_header('Location','/#'+legacy[legacy_key])
                self.send_header('Content-Length','0')
                self.end_headers()
                return
            if url.path.startswith('/api/'):
                with LOCK, connect() as db:
                    return self.get_api(db,url.path,parse_qs(url.query))
            path = (PUBLIC / unquote(url.path).lstrip('/')).resolve()
            if not path.is_relative_to(PUBLIC.resolve()):
                raise ApiError('无法访问该路径',403)
            if path.is_dir(): path /= 'index.html'
            if not path.is_file(): raise ApiError('页面不存在',404)
            data = path.read_bytes()
            self.send_response(200)
            # Windows registry may label .js as text/plain; nosniff then blocks it.
            web_types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml',
                       '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
                       '.woff':'font/woff','.woff2':'font/woff2'}
            mime = web_types.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            if mime.startswith('text/') or mime=='application/javascript': mime += '; charset=utf-8'
            self.common_headers(mime)
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except ApiError as e:
            self.respond({'error':e.message},e.status)
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception:
            self.respond({'error':'服务处理失败，请稍后重试。'},500)

    def get_api(self, db, path, q):
        if path=='/api/session':
            s = self.session(db,False)
            return self.respond({'user':{'id':s['user_id'],'name':s['name'],'email':s['email']} if s else None,'csrf':s['csrf'] if s else None})
        if path=='/api/health': return self.respond({'ok':True,'mode':'local-demo'})
        if path=='/api/works':
            text = q.get('q',[''])[0].strip()[:200]
            category = q.get('category',['全部'])[0]
            rows = db.execute('SELECT w.* FROM works w JOIN users u ON u.id=w.creator_id WHERE (w.title LIKE ? OR u.name LIKE ? OR w.id=? OR w.content_hash=? OR EXISTS(SELECT 1 FROM events e WHERE e.work_id=w.id AND e.hash=?)) AND (?=? OR category=?) ORDER BY w.rowid DESC',
                              ('%'+text+'%','%'+text+'%',text,text,text,category,'全部',category)).fetchall()
            works = [work_dict(db,r) for r in rows]
            sort = q.get('sort',['featured'])[0]
            if sort=='popular': works.sort(key=lambda w:w['collected'],reverse=True)
            elif sort=='price': works.sort(key=lambda w:w['price'])
            elif sort=='featured': works.sort(key=lambda w:w['id'])
            return self.respond({'works':works})
        if path.startswith('/api/works/'):
            wid = path[len('/api/works/'):]
            certificate = wid.endswith('/certificate')
            if certificate: wid=wid[:-12]
            row = db.execute('SELECT * FROM works WHERE id=?',(wid,)).fetchone()
            if not row: raise ApiError('未找到这件作品',404)
            result = {'work':work_dict(db,row),'events':history(db,wid),'ledger':verify_ledger(db)}
            if certificate:
                result.update({'notice':'本地演示存证，不是 FISCO BCOS 链上凭证或法律权属证明。','version':'1.0'})
            return self.respond(result)
        if path=='/api/stats':
            return self.respond({'works':db.execute('SELECT count(*) FROM works').fetchone()[0], 'creators':db.execute('SELECT count(DISTINCT creator_id) FROM works').fetchone()[0], 'records':db.execute('SELECT count(*) FROM events').fetchone()[0],'collections':db.execute('SELECT count(*) FROM collections').fetchone()[0]})
        if path=='/api/creators':
            rows = db.execute('SELECT u.id,u.name,count(DISTINCT w.id) AS works,count(c.id) AS collections FROM users u JOIN works w ON w.creator_id=u.id LEFT JOIN collections c ON c.work_id=w.id GROUP BY u.id ORDER BY collections DESC,works DESC,u.name').fetchall()
            return self.respond({'creators':[dict(r) for r in rows]})
        if path=='/api/collection':
            s=self.session(db)
            rows=db.execute('SELECT w.*,c.serial,c.created AS collected_at FROM collections c JOIN works w ON w.id=c.work_id WHERE c.user_id=? ORDER BY c.rowid DESC',(s['user_id'],)).fetchall()
            published=db.execute('SELECT * FROM works WHERE creator_id=? ORDER BY rowid DESC',(s['user_id'],)).fetchall()
            return self.respond({'works':[work_dict(db,r) for r in rows],'published':[work_dict(db,r) for r in published]})
        if path=='/api/orders':
            s=self.session(db)
            rows=db.execute('SELECT o.*,w.title,w.image FROM orders o JOIN works w ON w.id=o.work_id WHERE o.user_id=? ORDER BY o.rowid DESC',(s['user_id'],)).fetchall()
            return self.respond({'orders':[dict(row) for row in rows]})
        if path=='/api/verify':
            query=q.get('q',[''])[0].strip()
            if not query: raise ApiError('请输入作品编号、文件哈希或记录哈希。')
            row=db.execute('SELECT * FROM works WHERE id=? OR content_hash=? OR id IN (SELECT work_id FROM events WHERE hash=?)',(query,query,query)).fetchone()
            if not row: raise ApiError('没有找到对应记录，请核对作品编号或完整哈希。',404)
            # Check current file as well as the journal, since the two prove different properties.
            file = PUBLIC / row['image'].lstrip('/')
            result=verify_ledger(db)
            result['file_valid']=file.is_file() and hmac.compare_digest(hashlib.sha256(file.read_bytes()).hexdigest(),row['content_hash'])
            return self.respond({'work':work_dict(db,row),'events':history(db,row['id']),'ledger':result})
        raise ApiError('接口不存在',404)

    def do_POST(self):
        try:
            allowed={'127.0.0.1','localhost'}
            host=urlsplit('http://'+self.headers.get('Host','')).hostname
            if host not in allowed: raise ApiError('仅允许本地访问',403)
            origin=self.headers.get('Origin')
            if origin and origin not in {f'http://localhost:{self.server.server_port}',f'http://127.0.0.1:{self.server.server_port}'}:
                raise ApiError('请求来源不受支持',403)
            if self.headers.get_content_type()!='application/json': raise ApiError('请使用 JSON 请求',415)
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>6_000_000: raise ApiError('请求大小超出限制',413)
            try: data=json.loads(self.rfile.read(length))
            except Exception: raise ApiError('JSON 格式无效')
            if not isinstance(data,dict): raise ApiError('请求内容无效')
            with LOCK, connect() as db:
                result,status,cookie=self.post_api(db,urlsplit(self.path).path,data)
            self.respond(result,status,cookie)
        except ApiError as e: self.respond({'error':e.message},e.status)
        except (ValueError,TypeError): self.respond({'error':'输入格式不正确'},400)
        except Exception: self.respond({'error':'操作未完成，请稍后重试。'},500)

    def post_api(self,db,path,data):
        if path=='/api/auth/guest':
            existing=self.session(db,False)
            if existing: return {'ok':True},200,None
            uid='guest-'+secrets.token_hex(8)
            db.execute('INSERT INTO users(id,name,created) VALUES(?,?,?)',(uid,'体验收藏家',now()))
            return {'ok':True},201,self.new_session(db,uid)
        if path in ['/api/auth/register','/api/auth/login']:
            email=str(data.get('email','')).strip().lower()[:254]
            password=str(data.get('password',''))
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): raise ApiError('请输入有效邮箱')
            if not 8<=len(password)<=128: raise ApiError('密码长度需要在 8–128 位之间')
            if path.endswith('register'):
                name=str(data.get('name','')).strip()
                if not 1<=len(name)<=30: raise ApiError('昵称需要 1–30 个字符')
                if db.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone(): raise ApiError('此邮箱已注册，请登录',409)
                salt=secrets.token_hex(16)
                hashed=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),300000).hex()
                uid='user-'+secrets.token_hex(8)
                db.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(uid,name,email,hashed,salt,now()))
            else:
                row=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                salt=row['salt'] if row else '00'*16
                hashed=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),300000).hex()
                if not row or not hmac.compare_digest(hashed,row['password']): raise ApiError('邮箱或密码不正确',401)
                uid=row['id']
            return {'ok':True},200,self.new_session(db,uid)
        s=self.session(db)
        if not hmac.compare_digest(str(self.headers.get('X-CSRF-Token','')),s['csrf']): raise ApiError('页面会话已变化，请刷新重试',403)
        if path=='/api/auth/logout':
            db.execute('DELETE FROM sessions WHERE token=?',(s['token'],))
            return {'ok':True},200,'yl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
        if path=='/api/works':
            title=str(data.get('title','')).strip()
            category=str(data.get('category',''))
            description=str(data.get('description','')).strip()
            if not 2<=len(title)<=60: raise ApiError('作品名称需要 2–60 个字符')
            if category not in ['数字绘画','国风艺术','生成艺术','摄影艺术']: raise ApiError('请选择有效分类')
            if not 10<=len(description)<=1500: raise ApiError('作品介绍需要 10–1500 个字符')
            if data.get('rights') is not True: raise ApiError('请确认你拥有发布作品的权利')
            price=data.get('price'); supply=data.get('supply')
            if type(price)!=int or not 0<=price<=10000000: raise ApiError('展示价格超出范围')
            if type(supply)!=int or not 1<=supply<=10000: raise ApiError('发行量需要是 1–10000 的整数')
            encoded=str(data.get('image',''))
            match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)',encoded)
            if not match: raise ApiError('请上传 PNG、JPEG 或 WebP 图片')
            try: raw=base64.b64decode(match[2],validate=True)
            except Exception: raise ApiError('图片数据无效')
            if not 16<=len(raw)<=4*1024*1024: raise ApiError('图片大小不能超过 4MB')
            ext=match[1]
            valid=(ext=='png' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or (ext=='jpeg' and raw.startswith(b'\xff\xd8\xff')) or (ext=='webp' and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')
            if not valid: raise ApiError('图片类型与文件内容不匹配')
            wid='YL-'+secrets.token_hex(5).upper()
            upload=PUBLIC/'uploads'; upload.mkdir(exist_ok=True)
            filename=wid+'.'+ext
            file=upload/filename
            file.write_bytes(raw)
            ch=hashlib.sha256(raw).hexdigest()
            db.execute('INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?)',(wid,title,s['user_id'],category,description,price,supply,'/uploads/'+filename,ch,now()))
            eh=event(db,wid,'PUBLISH',s['user_id'],{'title':title,'content_hash':ch,'supply':supply,'mode':'local-demo'})
            return {'id':wid,'record_hash':eh,'message':'作品已发布，本地存证已生成'},201,None
        if path=='/api/orders':
            wid=str(data.get('work_id',''))
            w=db.execute('SELECT * FROM works WHERE id=?',(wid,)).fetchone()
            if not w: raise ApiError('作品不存在',404)
            if w['creator_id']==s['user_id']: raise ApiError('不能购买自己发布的作品')
            existing=db.execute("SELECT * FROM orders WHERE user_id=? AND work_id=? AND status IN ('PENDING','DEMO_PAID') ORDER BY rowid DESC LIMIT 1",(s['user_id'],wid)).fetchone()
            if existing: return {'order':dict(existing)},200,None
            if db.execute('SELECT count(*) FROM collections WHERE work_id=?',(wid,)).fetchone()[0]>=w['supply']: raise ApiError('作品已全部收藏',409)
            oid='YLORDER-'+secrets.token_hex(8).upper()
            db.execute('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)',(oid,s['user_id'],wid,w['price'],'PENDING',now(),now(),None))
            return {'order':dict(db.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone())},201,None
        if path.startswith('/api/orders/'):
            segments=path.split('/')
            if len(segments)!=5 or segments[-1] not in ['confirm','cancel']: raise ApiError('订单操作不存在',404)
            oid=segments[3];action=segments[4]
            order=db.execute('SELECT * FROM orders WHERE id=? AND user_id=?',(oid,s['user_id'])).fetchone()
            if not order: raise ApiError('订单不存在',404)
            if action=='cancel':
                if order['status']=='DEMO_PAID': raise ApiError('已完成的收藏不能取消',409)
                db.execute("UPDATE orders SET status='CANCELLED',updated=? WHERE id=?",(now(),oid))
                return {'ok':True,'status':'CANCELLED'},200,None
            if order['status']=='CANCELLED': raise ApiError('该订单已取消，请重新创建订单',409)
            return self.post_api(db,'/api/collect',{'work_id':order['work_id'],'confirm_demo':data.get('confirm_demo'),'order_id':oid})
        if path=='/api/collect':
            wid=str(data.get('work_id',''))
            if data.get('confirm_demo') is not True: raise ApiError('请确认这是无实际扣款的演示收藏')
            if data.get('order_id'):
                requested_order=db.execute('SELECT * FROM orders WHERE id=? AND user_id=? AND work_id=?',(str(data['order_id']),s['user_id'],wid)).fetchone()
                if not requested_order: raise ApiError('订单不存在',404)
                if requested_order['status']=='CANCELLED': raise ApiError('订单已取消',409)
            w=db.execute('SELECT * FROM works WHERE id=?',(wid,)).fetchone()
            if not w: raise ApiError('作品不存在',404)
            if w['creator_id']==s['user_id']: raise ApiError('你不能收藏自己发布的作品')
            existing=db.execute('SELECT * FROM collections WHERE user_id=? AND work_id=?',(s['user_id'],wid)).fetchone()
            if existing:
                if data.get('order_id'):
                    db.execute("UPDATE orders SET status='DEMO_PAID',updated=?,collection_id=? WHERE id=? AND user_id=?",(now(),existing['id'],data['order_id'],s['user_id']))
                return {'collection':dict(existing),'already':True},200,None
            count=db.execute('SELECT count(*) FROM collections WHERE work_id=?',(wid,)).fetchone()[0]
            if count>=w['supply']: raise ApiError('作品已全部收藏',409)
            cid='COL-'+secrets.token_hex(8).upper()
            oid=data.get('order_id') or 'YLORDER-'+secrets.token_hex(8).upper()
            if not data.get('order_id'):
                db.execute('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)',(oid,s['user_id'],wid,w['price'],'PENDING',now(),now(),None))
            eh=event(db,wid,'COLLECT',s['user_id'],{'collection_id':cid,'serial':count+1,'price':w['price'],'payment':'simulated-no-charge','order_id':oid})
            db.execute('INSERT INTO collections VALUES(?,?,?,?,?,?)',(cid,s['user_id'],wid,count+1,now(),eh))
            db.execute("UPDATE orders SET status='DEMO_PAID',updated=?,collection_id=? WHERE id=? AND user_id=?",(now(),cid,oid,s['user_id']))
            return {'collection':dict(db.execute('SELECT * FROM collections WHERE id=?',(cid,)).fetchone()),'already':False},201,None
        raise ApiError('接口不存在',404)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8877)
    parser.add_argument('--db',type=Path)
    args=parser.parse_args()
    global DB
    if args.db: DB=args.db.resolve()
    init_db()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Yilian local demo: http://127.0.0.1:{args.port}',flush=True)
    print('Local records and simulated collections only; no real payments or FISCO BCOS connection.',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=='__main__': main()
