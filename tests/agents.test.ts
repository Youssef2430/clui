import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { CodexClient, OpenCodeClient } from '../src/main/agents/transports'
import { NativeRun } from '../src/main/agents/native-run'
import { ControlPlane } from '../src/main/agents/control-plane'
import type { AgentRunManager } from '../src/main/agents/run-manager'
import type { PermissionServer } from '../src/main/hooks/permission-server'
import { requireProvider } from '../src/shared/providers'

class FakeCodex extends EventEmitter {
  child = { pid: 1 }; stderr: string[] = []; sent: any[] = []; calls: any[] = []; closed = false
  async initialize() {}
  async request(method: string, params: any) {
    this.calls.push({method,params})
    if(method.startsWith('thread/')) return {thread:{id:params.threadId || 'thread-1'},model:'discovered-model'}
    return {turn:{id:'turn-1'}}
  }
  send(m: any) { this.sent.push(m) }
  close() { this.closed=true }
  event(method: string, params: any, id?: number) { this.emit('message',{method,params,id}) }
}
function codexRun(options: any = {}) {
 const c=new FakeCodex();const run=new NativeRun({provider:'codex',projectPath:process.cwd(),prompt:'hi',...options},{codex:()=>c as unknown as CodexClient});const events:any[]=[]
 run.on('event',e=>events.push(e));return {c,run,events}
}
test('Codex transport frames split JSONL, times out, and rejects pending work on process death', async()=>{
 const c=new CodexClient(process.cwd(),resolve('tests/fixtures/codex-server.cjs'))
 try { await c.initialize();assert.deepEqual(await c.request('echo',{a:1}),{echo:{a:1}});await assert.rejects(c.request('hang',{},10),/timed out/);await assert.rejects(c.request('crash'),/exited/) } finally {c.close()}
})
test('Codex normalizes streaming and completed tool output without duplicate final text',async()=>{
 const {c,run,events}=codexRun();await run.start()
 c.event('item/agentMessage/delta',{threadId:'thread-1',itemId:'a',delta:'hello'})
 c.event('item/completed',{threadId:'thread-1',item:{id:'a',type:'agentMessage',text:'hello'}})
 c.event('item/started',{threadId:'other-thread',item:{id:'foreign',type:'commandExecution'}})
 c.event('item/started',{threadId:'thread-1',item:{id:'cmd',type:'commandExecution',command:'pwd'}})
 c.event('item/completed',{threadId:'thread-1',item:{id:'cmd',type:'commandExecution',command:'pwd',aggregatedOutput:'/workspace',exitCode:0}})
 c.event('thread/tokenUsage/updated',{threadId:'thread-1',tokenUsage:{last:{inputTokens:100,cachedInputTokens:40,cacheWriteInputTokens:10,outputTokens:20}}})
 c.event('turn/completed',{threadId:'thread-1',turn:{status:'completed'}})
 assert.equal(events.filter(e=>e.type==='text_chunk').map(e=>e.text).join(''),'hello')
 assert.equal(events.filter(e=>e.type==='tool_call').length,1)
 assert.equal(events.find(e=>e.type==='tool_result').result,'/workspace')
 assert.equal(events.filter(e=>e.type==='task_complete').length,1);assert.equal(c.closed,true)
 assert.equal(events.find(e=>e.type==='task_complete').costUsd,null)
 assert.deepEqual(events.find(e=>e.type==='task_complete').usage,{input_tokens:50,cache_read_input_tokens:40,cache_creation_input_tokens:10,output_tokens:20})
})
test('native approvals and questions route to the exact request and reject stale responses',async()=>{
 const {c,run,events}=codexRun();await run.start()
 c.event('item/commandExecution/requestApproval',{threadId:'child-thread',command:'pwd',token:'secret'},7)
 assert.equal(events.find(e=>e.type==='permission_request').toolInput.token,'***')
 assert.equal(await run.respond('codex:999','allow'),false)
 assert.equal(await run.respond('codex:7','deny'),true)
 assert.deepEqual(c.sent[0],{id:7,result:{decision:'decline'}})
 assert.equal(await run.respond('codex:7','allow'),false)
 c.event('item/tool/requestUserInput',{threadId:'thread-1',questions:[{id:'q',question:'Which?'}]},8)
 await run.respond('codex:8',{q:{answers:['A']}})
 assert.deepEqual(c.sent[1].result,{answers:{q:{answers:['A']}}})
 await run.cancel();assert.equal(run.finished,true)
})
test('resume uses native thread identity and cancellation before start creates no process',async()=>{
 const {c,run}=codexRun({sessionId:'old-thread',model:'chosen'});await run.start()
 assert.equal(c.calls[0].method,'thread/resume');assert.equal(c.calls[0].params.threadId,'old-thread');assert.equal(c.calls[0].params.model,'chosen')
 await run.cancel();assert.equal(c.calls.at(-1).method,'turn/interrupt')
 let created=false;const early=new NativeRun({provider:'codex',projectPath:'.',prompt:'hi'},{codex:()=>{created=true;return c as unknown as CodexClient}})
 await early.cancel();await early.start();assert.equal(created,false)
})
class FakeOpenCode {
 child=new EventEmitter();stderr=[];calls:any[]=[];handler:(e:any)=>void=()=>{};closed=false
 async request(path:string,body?:any){this.calls.push({path,body});return path==='/session'?{id:'s1'}:undefined}
 async events(handler:(e:any)=>void){this.handler=handler;return async()=>{}}
 close(){this.closed=true}
 event(type:string,properties:any){this.handler({type,properties})}
}
test('OpenCode filters user/reasoning deltas, tracks tool errors, and settles once on idle',async()=>{
 const c=new FakeOpenCode();const run=new NativeRun({provider:'opencode',projectPath:'.',prompt:'hi'},{opencode:()=>c as unknown as OpenCodeClient});const events:any[]=[]
 run.on('event',e=>events.push(e));await run.start()
 c.event('session.idle',{sessionID:'s1'});assert.equal(run.finished,false)
 c.event('message.updated',{info:{id:'m1',role:'assistant',sessionID:'s1',providerID:'native',modelID:'chosen'}})
 assert.equal(events.filter(e=>e.type==='session_init'&&!e.isWarmup).length,1)
 assert.equal(events.find(e=>e.type==='session_init'&&e.isWarmup).model,'native/chosen')
 c.event('message.part.updated',{part:{id:'r',type:'reasoning',sessionID:'s1',messageID:'m1',text:''}})
 c.event('message.part.delta',{partID:'r',sessionID:'s1',messageID:'m1',field:'text',delta:'private reasoning'})
 c.event('message.part.updated',{part:{id:'a',type:'text',sessionID:'s1',messageID:'m1',text:''}})
 c.event('message.part.delta',{partID:'a',sessionID:'s1',messageID:'m1',field:'text',delta:'answer'})
 c.event('message.part.updated',{part:{id:'a',type:'text',sessionID:'s1',messageID:'m1',text:'answer'}})
 c.event('message.part.updated',{part:{id:'t',type:'tool',sessionID:'s1',messageID:'m1',tool:'bash',state:{input:{command:'false'},status:'error',error:'failed'}}})
 c.event('session.status',{sessionID:'s1',status:{type:'idle'}});c.event('session.idle',{sessionID:'s1'})
 assert.equal(events.filter(e=>e.type==='text_chunk').map(e=>e.text).join(''),'answer')
 assert.equal(events.find(e=>e.type==='tool_result').isError,true)
 assert.equal(events.filter(e=>e.type==='task_complete').length,1)
})
test('OpenCode authenticates its private server and decodes split CRLF event frames',async()=>{
 const c=new OpenCodeClient(process.cwd(),'ask',resolve('tests/fixtures/opencode-server.cjs'));const events:any[]=[]
 try {
  assert.deepEqual(await c.request('/health'),{ok:true})
  await assert.rejects(c.request('/missing'),/503/)
  const read=await c.events(event=>{events.push(event);if(events.length===2)c.close()})
  await read().catch(error=>{if(events.length!==2)throw error})
  assert.deepEqual(events.map(e=>e.type),['first','second'])
 }finally{c.close()}
})
test('OpenCode routes nested-session approvals through the owning run',async()=>{
 const c=new FakeOpenCode();const run=new NativeRun({provider:'opencode',projectPath:'.',prompt:'hi'},{opencode:()=>c as unknown as OpenCodeClient});const events:any[]=[]
 run.on('event',e=>events.push(e));await run.start()
 c.event('session.created',{info:{id:'child',parentID:'s1'}})
 c.event('permission.asked',{sessionID:'child',id:'approve-child',permission:'edit'})
 assert.equal(events.find(e=>e.type==='permission_request').questionId,'opencode:approve-child')
 assert.equal(await run.respond('opencode:approve-child','allow'),true)
 assert.deepEqual(c.calls.at(-1),{path:'/permission/approve-child/reply',body:{reply:'once'}})
 await run.cancel()
})
class FakeManager extends EventEmitter {
 runs=new Map<string,any>(); starts:any[]=[]
 startRun(id:string,options:any){this.runs.set(id,options);this.starts.push({id,options});return{pid:1}}
 isRunning(id:string){return this.runs.has(id)}
 cancel(id:string){if(!this.runs.has(id))return false;this.runs.delete(id);this.emit('exit',id,0,'SIGINT',null);return true}
 end(id:string,session='sid'){this.runs.delete(id);this.emit('normalized',id,{type:'session_init',sessionId:session});this.emit('exit',id,0,null,session)}
 getEnrichedError(){return {message:'fixture failure',stderrTail:[],exitCode:1,elapsedMs:0,toolCallCount:0}}
}
class FakePermissions extends EventEmitter { async start(){} getPort(){return 0} stop(){} }
function plane(){const m=new FakeManager();const c=new ControlPlane(false,m as unknown as AgentRunManager,new FakePermissions() as unknown as PermissionServer);c.on('error',()=>{});return{m,c}}
test('orchestration isolates agents, deduplicates requests, and queues against the latest session',async()=>{
 const {m,c}=plane();const a=c.createTab('codex');const b=c.createTab('opencode');const options={provider:'codex' as const,projectPath:'.',prompt:'hi'}
 const first=c.submitPrompt(a,'r1',options);const duplicate=c.submitPrompt(a,'r1',options);const next=c.submitPrompt(a,'r2',options)
 assert.equal(first,duplicate);assert.equal(m.starts.length,1);assert.equal(c.getHealth().queueDepth,1)
 await assert.rejects(c.submitPrompt(b,'r1',{...options,provider:'opencode'}),/another tab/)
 assert.throws(()=>c.setProvider(a,'opencode'),/Stop/)
 m.end('r1','native-session');await first;assert.equal(m.starts[1].options.sessionId,'native-session')
 m.end('r2');await next;await c.submitPrompt(a,'r1',options);assert.equal(m.starts.length,2)
 c.shutdown()
})
test('stop clears queued work and late events cannot revive a closed tab',async()=>{
 const {m,c}=plane();const tab=c.createTab('codex');const options={provider:'codex' as const,projectPath:'.',prompt:'hi'}
 const a=c.submitPrompt(tab,'a',options);const b=c.submitPrompt(tab,'b',options);c.closeTab(tab);await Promise.all([a,b]);m.end('a')
 assert.equal(m.starts.length,1);assert.equal(c.getHealth().tabs.length,0);assert.equal(c.getHealth().queueDepth,0);c.shutdown()
})
test('unknown provider identifiers cannot select arbitrary executables',()=>{assert.throws(()=>requireProvider('__proto__'));assert.throws(()=>requireProvider('sh'));assert.equal(requireProvider(undefined),'claude')})
