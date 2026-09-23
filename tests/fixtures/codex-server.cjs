#!/usr/bin/env node
const { createInterface } = require('node:readline')
createInterface({ input: process.stdin }).on('line', line => {
 const m=JSON.parse(line)
 if(m.method==='crash') process.exit(2)
 if(m.method==='hang') return
 if(m.id===undefined)return
 const response=JSON.stringify({id:m.id,result:m.method==='initialize'?{userAgent:'fixture'}:{echo:m.params}})+'\n'
 // A response deliberately split across chunks validates JSONL framing.
 process.stdout.write(response.slice(0,3));setTimeout(()=>process.stdout.write(response.slice(3)),5)
})
