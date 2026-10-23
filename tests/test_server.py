"""Run: python -m unittest discover -s tests -v"""
import base64
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

spec=importlib.util.spec_from_file_location('yilian_server',Path(__file__).resolve().parents[1]/'server.py')
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='

class Client:
    def __init__(self,base):
        self.base=base
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(CookieJar()))
        self.csrf=''
    def req(self,path,data=None,headers=None):
        hs={'Content-Type':'application/json','X-CSRF-Token':self.csrf,'Origin':self.base}
        if headers:hs.update(headers)
        req=urllib.request.Request(self.base+path,json.dumps(data).encode() if data is not None else None,hs)
        try:r=self.opener.open(req,timeout=5)
        except urllib.error.HTTPError as e:r=e
        raw=r.read()
        try:result=json.loads(raw)
        except Exception:result=raw
        return r.status,result
    def guest(self):
        self.req('/api/auth/guest',{})
        _,r=self.req('/api/session');self.csrf=r['csrf']
        return r

class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        root=Path(cls.temp.name)
        app.DB=root/'test.sqlite3'
        original=app.PUBLIC
        app.PUBLIC=root/'public'
        shutil.copytree(original,app.PUBLIC)
        app.init_db()
        cls.http=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join();cls.temp.cleanup()
    def client(self):return Client(self.base)
    def publish(self,c,supply=2):
        status,r=c.req('/api/works',{'title':'测试原创作品','description':'这是用于核对完整发布收藏流程的原创测试说明。','category':'数字绘画','price':3900,'supply':supply,'rights':True,'image':PNG})
        self.assertEqual(status,201,r)
        return r['id']
    def test_anonymous_browse_and_static_isolation(self):
        c=self.client();status,r=c.req('/api/works');self.assertEqual(status,200);self.assertGreaterEqual(len(r['works']),6)
        self.assertEqual(c.req('/server.py')[0],404)
        self.assertEqual(c.req('/%2e%2e/server.py')[0],403)
        self.assertEqual(c.req('/api/collection')[0],401)
        self.assertEqual(c.req('/')[0],200)
        with c.opener.open(self.base+'/app.js') as response:
            self.assertEqual(response.headers.get_content_type(),'application/javascript')
    def test_publish_collect_verify_and_idempotency(self):
        author=self.client();author.guest();wid=self.publish(author)
        self.assertEqual(author.req('/api/collect',{'work_id':wid,'confirm_demo':True})[0],400)
        buyer=self.client();buyer.guest()
        status,r=buyer.req('/api/collect',{'work_id':wid,'confirm_demo':True});self.assertEqual(status,201,r)
        self.assertEqual(r['collection']['serial'],1)
        status,second=buyer.req('/api/collect',{'work_id':wid,'confirm_demo':True});self.assertEqual(status,200);self.assertTrue(second['already'])
        self.assertEqual(r['collection']['event_hash'],second['collection']['event_hash'])
        status,r=buyer.req('/api/verify?q='+wid);self.assertEqual(status,200);self.assertTrue(r['ledger']['valid']);self.assertTrue(r['ledger']['file_valid']);self.assertEqual(len(r['events']),2)
        self.assertEqual(buyer.req('/api/verify?q='+r['work']['content_hash'])[0],200)
        self.assertEqual(buyer.req('/api/verify?q='+r['events'][-1]['hash'])[0],200)
        self.assertEqual(buyer.req('/api/works/'+wid+'/certificate')[1]['version'],'1.0')
        self.assertEqual(len(buyer.req('/api/collection')[1]['works']),1)
    def test_concurrent_stock_limit(self):
        author=self.client();author.guest();wid=self.publish(author,1)
        a,b=self.client(),self.client();a.guest();b.guest()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda c:c.req('/api/collect',{'work_id':wid,'confirm_demo':True}),[a,b]))
        self.assertEqual(sorted(r[0] for r in results),[201,409])
        self.assertEqual(self.client().req('/api/works/'+wid)[1]['work']['remaining'],0)
    def test_csrf_and_external_origin(self):
        c=self.client();c.guest()
        self.assertEqual(c.req('/api/collect',{'work_id':'YL-001','confirm_demo':True},{'X-CSRF-Token':'bad'})[0],403)
        self.assertEqual(c.req('/api/auth/guest',{}, {'Origin':'https://outside.example'})[0],403)
    def test_order_states_and_ownership(self):
        c=self.client();c.guest()
        other=self.client();other.guest()
        status,r=c.req('/api/orders',{'work_id':'YL-003'});self.assertEqual(status,201,r)
        oid=r['order']['id'];self.assertEqual(r['order']['status'],'PENDING')
        self.assertEqual(c.req('/api/orders',{'work_id':'YL-003'})[1]['order']['id'],oid)
        self.assertEqual(other.req('/api/orders/'+oid+'/confirm',{'confirm_demo':True})[0],404)
        self.assertEqual(c.req('/api/orders/'+oid+'/cancel',{})[0],200)
        self.assertEqual(c.req('/api/orders/'+oid+'/confirm',{'confirm_demo':True})[0],409)
        _,r=c.req('/api/orders',{'work_id':'YL-003'});fresh=r['order']['id'];self.assertNotEqual(fresh,oid)
        self.assertEqual(c.req('/api/orders/'+fresh+'/confirm',{'confirm_demo':True})[0],201)
        self.assertEqual(c.req('/api/orders/'+fresh+'/confirm',{'confirm_demo':True})[0],200)
        self.assertEqual(c.req('/api/orders/'+fresh+'/cancel',{})[0],409)
        orders=c.req('/api/orders')[1]['orders']
        self.assertEqual({o['status'] for o in orders},{'DEMO_PAID','CANCELLED'})
        self.assertEqual(len(other.req('/api/orders')[1]['orders']),0)
    def test_validation(self):
        c=self.client();c.guest()
        invalid={'title':'测试作品','description':'这里是一段用于验证上传类型的足够长介绍。','category':'数字绘画','price':3900,'supply':1,'rights':True,'image':'data:image/png;base64,PGh0bWw+PC9odG1sPg=='}
        self.assertEqual(c.req('/api/works',invalid)[0],400)
        invalid['image']=PNG;invalid['supply']=-1
        self.assertEqual(c.req('/api/works',invalid)[0],400)
        self.assertEqual(c.req('/api/verify?q=not-found')[0],404)
    def test_accounts_and_session_persistence(self):
        c=self.client()
        self.assertEqual(c.req('/api/auth/register',{'name':'测试藏家','email':'collector@example.test','password':'example-pass-2026'})[0],200)
        _,session=c.req('/api/session');c.csrf=session['csrf'];uid=session['user']['id']
        self.assertEqual(c.req('/api/collect',{'work_id':'YL-002','confirm_demo':True})[0],201)
        self.assertEqual(c.req('/api/auth/logout',{})[0],200)
        self.assertEqual(c.req('/api/collection')[0],401)
        self.assertEqual(c.req('/api/auth/login',{'email':'collector@example.test','password':'incorrect-pass'})[0],401)
        self.assertEqual(c.req('/api/auth/login',{'email':'collector@example.test','password':'example-pass-2026'})[0],200)
        self.assertEqual(c.req('/api/session')[1]['user']['id'],uid)
        self.assertEqual(len(c.req('/api/collection')[1]['works']),1)
    def test_tamper_detection(self):
        with app.LOCK, app.connect() as db:
            row=db.execute('SELECT * FROM events ORDER BY id LIMIT 1').fetchone()
            original=row['payload']
            db.execute('UPDATE events SET payload=? WHERE id=?',('{"changed":true}',row['id']))
        try:
            _,r=self.client().req('/api/verify?q=YL-001');self.assertFalse(r['ledger']['valid'])
        finally:
            with app.LOCK, app.connect() as db:db.execute('UPDATE events SET payload=? WHERE id=?',(original,row['id']))

if __name__=='__main__':unittest.main(verbosity=2)
