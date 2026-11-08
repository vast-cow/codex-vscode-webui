const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
class Disposable { constructor(fn=()=>{}) {this.fn=fn;} dispose(){this.fn();} static from(...items){return new Disposable(()=>items.forEach(x=>x.dispose()));} }
class EventEmitter { constructor(){this.listeners=new Set;this.event=(fn,ctx,bag)=>{const cb=ctx?fn.bind(ctx):fn;this.listeners.add(cb);const d=new Disposable(()=>this.listeners.delete(cb));bag?.push(d);return d;};} fire(x){for(const f of this.listeners)f(x);} dispose(){this.listeners.clear();} }
class Uri {
 constructor(value){this.url=new URL(value);}
 static file(p){return new Uri(pathToFileURL(path.resolve(p)).href);}
 static parse(s){return new Uri(s);}
 static joinPath(u,...parts){return u.with({path:path.posix.join(u.path,...parts)});}
 static from(x){return Uri.parse(`${x.scheme}://${x.authority||''}${x.path||''}${x.query?'?'+x.query:''}${x.fragment?'#'+x.fragment:''}`);}
 get fsPath(){return this.scheme==='file'?fileURLToPath(this.url):this.path;} get path(){return decodeURIComponent(this.url.pathname);} get scheme(){return this.url.protocol.slice(0,-1);} get authority(){return this.url.host;} get query(){return this.url.search.slice(1);} get fragment(){return this.url.hash.slice(1);}
 with(x){const u=new URL(this.url);if(x.path!==undefined)u.pathname=x.path;if(x.scheme)u.protocol=x.scheme+':';if(x.authority!==undefined)u.host=x.authority;if(x.query!==undefined)u.search=x.query;if(x.fragment!==undefined)u.hash=x.fragment;return new Uri(u.href);}
 toString(){return this.url.href;} toJSON(){return {scheme:this.scheme,authority:this.authority,path:this.path,query:this.query,fragment:this.fragment};}
}
class Position {constructor(line,character){this.line=line;this.character=character;}}
class Range {constructor(a,b,c,d){this.start=typeof a==='number'?new Position(a,b):a;this.end=typeof a==='number'?new Position(c,d):b;}}
function store(file){let data={};try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return {get:(k,d)=>data[k]??d,keys:()=>Object.keys(data),setKeysForSync(){},async update(k,v){if(v===undefined)delete data[k];else data[k]=v;fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);}};}
function createCompat({assets,workspace,state,send}){
 fs.mkdirSync(state,{recursive:true,mode:0o700});
 const providers=new Map,views=new Map,commands=new Map,changed=new EventEmitter;
 const settings=store(path.join(state,'settings.json'));const pkg=JSON.parse(fs.readFileSync(path.join(assets,'package.json')));
 const defaults=Object.fromEntries(Object.entries(pkg.contributes.configuration.properties).map(([k,v])=>[k,v.default]));
 const event=()=>new EventEmitter().event;const unsupported=name=>{throw Error(`Unsupported VS Code API: ${name}`);};
 const output={append: s=>process.stderr.write(String(s)),appendLine:s=>process.stderr.write(String(s)+'\n'),trace(){},debug(){},info(){},warn:console.warn,error:console.error,show(){},hide(){},dispose(){}};
 const folder={uri:Uri.file(workspace),name:path.basename(workspace),index:0};
 const extension={id:'openai.chatgpt',extensionPath:assets,extensionUri:Uri.file(assets),packageJSON:pkg,isActive:true};
 const api={version:'1.96.2',Disposable,EventEmitter,Uri,Position,Range,Selection:Range,RelativePattern:class{constructor(base,pattern){this.baseUri=base.uri||base;this.pattern=pattern;}},
 ConfigurationTarget:{Global:1,Workspace:2,WorkspaceFolder:3},FileType:{Unknown:0,File:1,Directory:2,SymbolicLink:64},DiagnosticSeverity:{Error:0,Warning:1,Information:2,Hint:3},ViewColumn:{Active:-1,Beside:-2,One:1},TextEditorRevealType:{Default:0},SymbolKind:{},TabInputText:class{},TabInputCustom:class{},CodeLens:class{},
 l10n:{t:(s,...args)=>s.replace(/\{(\d+)\}/g,(_,i)=>args[i]??_)},
 env:{appName:'Codex Standalone',language:'en',uriScheme:'codex-standalone',remoteName:undefined,openExternal:async uri=>{send({type:'external',url:uri.toString()});return true;},clipboard:{readText:async()=>unsupported('clipboard.readText'),writeText:async text=>send({type:'clipboard',text})}},
 extensions:{getExtension:id=>id==='openai.chatgpt'?extension:undefined},
 languages:{getDiagnostics:()=>[],registerCodeLensProvider:()=>new Disposable()},
 workspace:{name:folder.name,isTrusted:true,workspaceFolders:[folder],onDidChangeConfiguration:changed.event,onDidChangeTextDocument:event(),onDidChangeWorkspaceFolders:event(),
 getWorkspaceFolder:u=>u.fsPath===workspace||u.fsPath.startsWith(workspace+path.sep)?folder:undefined,
 asRelativePath:u=>path.relative(workspace,typeof u==='string'?u:u.fsPath),
 getConfiguration:(section='')=>({get:(key,fallback)=>settings.get(section?section+'.'+key:key,defaults[section?section+'.'+key:key]??fallback),has:key=>settings.get(section+'.'+key,defaults[section+'.'+key])!==undefined,inspect:key=>({key:section+'.'+key,defaultValue:defaults[section+'.'+key],globalValue:settings.get(section+'.'+key)}),update:async(key,value)=>{const full=section?section+'.'+key:key;await settings.update(full,value);changed.fire({affectsConfiguration:s=>full===s||full.startsWith(s+'.')});}}),
 fs:{readFile:async u=>new Uint8Array(await fs.promises.readFile(u.fsPath)),writeFile:async(u,b)=>fs.promises.writeFile(u.fsPath,b),stat:async u=>{const s=await fs.promises.stat(u.fsPath);return {type:s.isDirectory()?2:1,ctime:s.ctimeMs,mtime:s.mtimeMs,size:s.size};},readDirectory:async u=>(await fs.promises.readdir(u.fsPath,{withFileTypes:true})).map(x=>[x.name,x.isDirectory()?2:1]),createDirectory:async u=>fs.promises.mkdir(u.fsPath,{recursive:true}),delete:async(u,o)=>fs.promises.rm(u.fsPath,{recursive:o?.recursive}),rename:async(a,b)=>fs.promises.rename(a.fsPath,b.fsPath)},
 findFiles:async()=>unsupported('workspace.findFiles'),
 createFileSystemWatcher(pattern){const c=new EventEmitter,d=new EventEmitter,a=new EventEmitter;let watcher;try{const base=pattern.baseUri?.fsPath||workspace;watcher=fs.watch(base,{recursive:true},(kind,file)=>{const uri=Uri.file(path.join(base,file||''));(kind==='change'?c:fs.existsSync(uri.fsPath)?a:d).fire(uri);});}catch(e){output.warn('File watcher unavailable: '+e.message);}return {onDidChange:c.event,onDidCreate:a.event,onDidDelete:d.event,dispose(){watcher?.close();}};},
 openTextDocument:async u=>{u=typeof u==='string'?Uri.file(u):u;const text=await fs.promises.readFile(u.fsPath,'utf8');return {uri:u,fileName:u.fsPath,getText:()=>text,lineCount:text.split('\n').length,languageId:'plaintext',isDirty:false};}},
 window:{state:{focused:true},activeTextEditor:undefined,visibleTextEditors:[],tabGroups:{all:[],onDidChangeTabs:event(),onDidChangeTabGroups:event()},onDidChangeWindowState:event(),onDidChangeActiveTextEditor:event(),onDidChangeTextEditorSelection:event(),onDidChangeTerminalShellIntegration:event(),createOutputChannel:()=>output,createTextEditorDecorationType:()=>new Disposable(),registerUriHandler:()=>new Disposable(),registerCustomEditorProvider:()=>new Disposable(),registerWebviewViewProvider:(id,p)=>{providers.set(id,p);return new Disposable(()=>providers.delete(id));},
 showTextDocument:async doc=>{send({type:'preview',text:doc.getText(),path:doc.fileName});return {document:doc};},
 showOpenDialog:async()=>unsupported('server file picker'),showSaveDialog:async()=>unsupported('server save picker'),createTerminal:()=>unsupported('terminal'),createWebviewPanel:()=>unsupported('additional panels')},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return new Disposable(()=>commands.delete(id));},executeCommand:async(id,...args)=>{if(commands.has(id))return commands.get(id)(...args);if(id==='setContext')return;if(id==='workbench.action.reloadWindow'){send({type:'reload'});return;}if(id.endsWith('.focus')||id==='workbench.view.extension.codexViewContainer')return;if(id==='workbench.action.openSettings'){send({type:'notice',message:'Settings are available through Codex settings.'});return;}throw Error('Unsupported command: '+id);}}};
 for(const name of ['showErrorMessage','showWarningMessage','showInformationMessage'])api.window[name]=async(message,...items)=>{send({type:'notice',message});if(items.some(x=>typeof x==='string'))throw Error('Interactive notification requires browser confirmation: '+message);};
 const context={subscriptions:[],extension,extensionUri:extension.extensionUri,extensionPath:assets,globalStorageUri:Uri.file(state),storageUri:Uri.file(path.join(state,'workspace')),logUri:Uri.file(path.join(state,'logs')),extensionMode:1,globalState:store(path.join(state,'global.json')),workspaceState:store(path.join(state,'workspace.json')),asAbsolutePath:p=>path.join(assets,p),secrets:{get:async()=>undefined,store:async()=>unsupported('secrets'),delete:async()=>unsupported('secrets')}};
 async function open(id){const receive=new EventEmitter,dispose=new EventEmitter;let html='';const webview={options:{},cspSource:"'self'",asWebviewUri:u=>Uri.parse('http://standalone.invalid/assets/'+path.relative(path.join(assets,'webview'),u.fsPath).split(path.sep).join('/')),onDidReceiveMessage:receive.event,postMessage:async message=>{send({type:'message',id,message});return true;},get html(){return html;},set html(v){html=v;},};const view={webview,visible:true,onDidDispose:dispose.event,onDidChangeVisibility:event(),show(){},dispose(){dispose.fire();views.delete(id);}};views.set(id,{receive,view});await providers.get('chatgpt.sidebarView').resolveWebviewView(view,{}, {isCancellationRequested:false,onCancellationRequested:event()});return html;}
 return {api,context,open,receive:(id,m)=>views.get(id)?.receive.fire(m),close:id=>views.get(id)?.view.dispose()};
}
module.exports={createCompat,Uri,EventEmitter,store};
