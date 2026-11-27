import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export function classify(code,s){
 if([5,6].includes(code))return 'dns_failure';
 if(code===7)return 'connection_failure';
 if(code===28)return 'network_timeout';
 if([35,51,58,60,77].includes(code))return 'tls_failure';
 if(code!==0)return 'transport_failure';
 return ({401:'authentication_required',403:'access_denied_unclassified',404:'not_found',429:'rate_limited'})[s]||(s>=500?'upstream_failure':s>=200&&s<300?'metadata_reachable':'http_failure');
}
export async function diagnose({url,kind='model',external_access_allowed=false,ipv4=false},runner=run){
 if(!['model','data','code','other'].includes(kind))throw Error('Invalid kind');
 const u=new URL(url);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Public HTTP(S) URL without credentials, query or fragment required');
 if(!external_access_allowed)return {stage:'not_probed',network_attempted:false};
 const args=['--silent','--show-error','--head','--location','--max-redirs','5','--proto','=http,https','--proto-redir','=http,https','--connect-timeout','8','--max-time','20','--output','/dev/null','--write-out','%{http_code}'];
 if(ipv4)args.push('--ipv4');args.push('--url',u.href);
 let code=0,stdout='';
 try{({stdout}=await runner('curl',args,{timeout:23000,maxBuffer:16384}));}catch(e){code=Number.isInteger(e.code)?e.code:-1;stdout=String(e.stdout||'');}
 const status=/^[0-9]{3}$/.test(stdout.trim())?Number(stdout.trim()):0;
 const issue=classify(code,status);
 const routes={dns_failure:'Check DNS inside the actual worker/container and compare host resolution.',connection_failure:'Check approved proxy and routing; container localhost is not host localhost. Compare IPv4.',network_timeout:'Check proxy propagation, IPv4 routing and connect versus transfer timeout.',tls_failure:'Check clock and CA/proxy certificates; keep TLS verification enabled.',authentication_required:'Check existing authorized repository access; do not create credentials.',access_denied_unclassified:'Inspect sanitized response for authorization, network policy or expired redirects; 403 alone is not a task prohibition.',not_found:'Verify official owner, revision and filename.',rate_limited:'Honor Retry-After within budget.',upstream_failure:'Bounded retry or provenance-verified distribution.'};
 const next_actions=[routes[issue]||'HEAD only; unsupported HEAD may require a small bounded GET.'];
 if(kind==='model')next_actions.push('Separate Hub config/API from actual weight-shard transfer; check redirected Xet/CDN hosts and client compatibility.');
 if(kind==='code')next_actions.push('Test official HTTPS git ls-remote, pin commit and inspect submodules/LFS. SSH 443 needs existing authorized setup.');
 if(kind==='data')next_actions.push('Find original publisher/DOI and verify maintained distribution, release, split and checksum.');
 next_actions.push('Reuse verified workspace assets; inspect shared caches only when explicitly authorized. Use a configured download node or verified mirror if available. Unconfigured routes remain proposals, not attempted recoveries.','Acquire within disk/time budget, validate real input and method-specific gradients/attention, then resume original experiment.');
 return {schema_version:'1.0',observed_at:new Date().toISOString(),host:u.hostname,kind,ipv4,stage:'diagnosed',network_attempted:true,curl_exit:code,http_status:status,issue,permission_blocked:false,next_actions,note:'HEAD only: does not establish download or experiment feasibility'};
}
