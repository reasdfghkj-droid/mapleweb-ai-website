"""Offline fail-closed checks of D1 staging binding resolution."""
from pathlib import Path
import tempfile, json, subprocess
root=Path(__file__).resolve().parents[1]
script=root/'scripts/resolve-staging-d1.mjs'
src=root/'workers/wrangler.staging.jsonc'
with tempfile.TemporaryDirectory() as td:
 p=Path(td)/'wrangler.staging.jsonc'
 for data,code in [
  ([{'name':'mapleweb-agent-staging','uuid':'12345678-1234-1234-1234-123456789abc'}],0),
  ([{'name':'mapleweb-agent','uuid':'12345678-1234-1234-1234-123456789abc'}],1),
  ([{'name':'mapleweb-agent-staging','uuid':'not-a-uuid'}],1),
  ([],1),
 ]:
  p.write_text(src.read_text())
  proc=subprocess.run(['node',str(script),str(p)],input=json.dumps(data),capture_output=True,text=True)
  assert (proc.returncode==0)==(code==0), (data,proc.stderr)
  cfg=json.loads(p.read_text())
  if code==0:
   assert cfg['d1_databases'][0]['binding']=='DB'
   assert cfg['d1_databases'][0]['database_name']=='mapleweb-agent-staging'
  else:
   assert 'd1_databases' not in cfg
  assert cfg['vars']['SUBMISSIONS_APPROVED']=='false'
 # The Manager can bind D1 without ever exposing customer intake.
 manager=root/'workers/wrangler.manager.staging.jsonc'
 p.write_text(manager.read_text())
 proc=subprocess.run(['node',str(script),str(p)],input=json.dumps([{'name':'mapleweb-agent-staging','uuid':'12345678-1234-1234-1234-123456789abc'}]),capture_output=True,text=True)
 assert proc.returncode==0,proc.stderr
 cfg=json.loads(p.read_text())
 assert cfg['name']=='mapleweb-ai-manager-staging'
 assert cfg['d1_databases'][0]['binding']=='DB'
 assert 'SUBMISSIONS_APPROVED' not in cfg.get('vars',{})
print('Staging binding resolution PASS, rejecting production/nonexistent/invalid D1.')
