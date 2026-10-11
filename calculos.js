/* =================================================================
   CÁLCULOS — todas as contas do Nutre Compare Pro, num lugar só.

   Este arquivo não mexe na tela. Recebe dados, devolve resultado e
   um MEMORIAL (entradas, fórmula, passos, avisos) que a tela mostra
   em "Como essa conta é feita?".

   Invariantes (ver CLAUDE.md, seção 4) — não quebre:
   1. Dado ausente nunca vira zero: o cálculo é recusado e vira N/D.
   2. Inclusão é em matéria natural: valor_MN = valor_MS × MS% / 100.
   3. PDR e PNDR (% da PB) são ponderados pela proteína, não pela massa.
   4. Preço limite = Preço_ref × (nutriente_aval / nutriente_ref).
      É o preço equivalente NAQUELE nutriente, não um "preço justo".

   Qualquer mudança aqui: rode testes.html antes de publicar.
   Depende de dados.js (COMS, P, FAIXAS).
   ================================================================= */

/* ================= ACESSO AOS DADOS ================= */
function meta(p){const r=P.find(x=>x[0]===p);return r?{un:r[1],base:r[2],cat:r[3]}:null}
/* Cada linha de P pode ter um 6º elemento com o registro da aba FONTES
   por commodity: {ok, fonte, link, data, obs}. ok=true só quando o Status é
   DEFINITIVO/VERIFICADO e há fonte registrada. Sem registro → provisório. */
function get(com,p){
  const r=P.find(x=>x[0]===p); if(!r) return {v:null,un:"",base:"MS",prov:true,fonte:null};
  const i=COMS.indexOf(com); const v=(i<0)?null:r[4][i];
  const f=(i>=0&&r[5])?r[5][i]:null;
  return {v:(v===null||v===undefined)?null:v,un:r[1],base:r[2],
          prov:!(f&&f.ok),fonte:f&&f.fonte?f.fonte:null};
}
/* texto curto de fonte para o memorial */
function fonteTxt(d){return d.fonte?d.fonte+(d.prov?" (provisório)":""):"sem fonte registrada"}
function msPct(com){return get(com,"Matéria Seca").v}
function toMN(com,p){ /* valor_MN = valor_MS × MS% / 100 */
  const d=get(com,p); if(d.v===null) return {v:null,nota:null};
  if(d.base==="MN") return {v:d.v,nota:"já estava em matéria natural"};
  const ms=msPct(com); if(ms===null||ms<=0) return {v:null,nota:"Matéria Seca ausente"};
  return {v:d.v*ms/100,nota:`${fmt(d.v)} × ${fmt(ms)}% / 100 = ${fmt(d.v*ms/100)}`};
}

/* ================= LEITURA DE NÚMERO DIGITADO =================
   Aceita formato BR (12,5 · 1.200,50) e US (12.5 · 1,200.50).
   Devolve null se não entender — NUNCA zero. Zero só se digitarem 0.
   Não simplifique para replace(',','.'): foi o bug da v1.0, em que
   "1.200,50" virava "1.200.50" e o erro era engolido como zero.     */
function lerPercentual(texto){
  let s=String(texto==null?"":texto).replace(/%/g,"").replace(/\s/g,"");
  if(!s) return null;
  const temV=s.includes(","), temP=s.includes(".");
  if(temV&&temP){
    // o separador que aparece por último é o decimal; o outro é milhar
    if(s.lastIndexOf(",")>s.lastIndexOf(".")) s=s.replace(/\./g,"").replace(",",".");
    else s=s.replace(/,/g,"");
  }else if(temV){
    if((s.match(/,/g)||[]).length>1) return null;
    s=s.replace(",",".");
  }else if(temP){
    if((s.match(/\./g)||[]).length>1) return null;
  }
  if(!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

/* ================= FORMATAÇÃO ================= */
function fmt(x,c=2){
  if(x===null||x===undefined||isNaN(x)) return "N/D";
  const s=x.toLocaleString("pt-BR",{minimumFractionDigits:c,maximumFractionDigits:c});
  return /^-0(,0+)?$/.test(s)?s.slice(1):s;   // -0,0001 arredonda para 0,00, não "-0,00"
}
function brl(x,c=2){return x===null||x===undefined||isNaN(x)?"N/D":"R$ "+fmt(x,c)}

/* ================= CUSTO POR NUTRIENTE ================= */
function custoPorNutriente(com,p,preco){
  const d=get(com,p);
  const m={ent:[["Preço da tonelada",brl(preco)],[`${p} (${d.base})`,d.v===null?"N/D":fmt(d.v)+" "+d.un],
                ["Fonte do dado",fonteTxt(d)]],
           form:"",passos:[],res:null,blk:null,avisos:[]};
  if(!preco||preco<=0){m.blk="preço não informado ou inválido.";return{v:null,un:null,m}}
  if(d.v===null){m.blk=`o valor de ${p} para ${com} não existe na planilha (N/D). `+
    `O sistema não substitui dado ausente por zero.`;return{v:null,un:null,m}}
  if(d.v<=0){m.blk=`${p} é zero ou negativo; a divisão seria inválida.`;return{v:null,un:null,m}}
  const u=d.un.toLowerCase(); let qtd,uc;
  if(u.includes("%")&&!u.includes("da pb")){
    qtd=d.v*10; uc="R$/kg"; m.form="Custo = Preço da tonelada / (valor % × 10)";
    m.passos.push(`Uma tonelada tem 1.000 kg, então ${fmt(d.v)}% equivale a ${fmt(d.v)} × 10 = ${fmt(qtd)} kg por tonelada.`);
  }else if(u.includes("mcal/kg")){
    qtd=d.v*1000; uc="R$/Mcal"; m.form="Custo = Preço da tonelada / (Mcal/kg × 1.000)";
    m.passos.push(`Uma tonelada tem 1.000 kg, então ${fmt(d.v)} Mcal/kg equivale a ${fmt(d.v)} × 1.000 = ${fmt(qtd)} Mcal por tonelada.`);
  }else{
    m.blk=`a unidade "${d.un}" não permite determinar a quantidade contida em uma tonelada. Custo por unidade não calculado.`;
    return{v:null,un:null,m};
  }
  if(d.base==="MS") m.avisos.push("Valor em base de matéria seca. O custo é por unidade de nutriente na matéria seca do ingrediente.");
  const r=preco/qtd;
  m.passos.push(`${brl(preco)} / ${fmt(qtd)} = ${brl(r)}`);
  m.res=`${brl(r)} por unidade (${uc})`;
  if(d.prov) m.avisos.push("Dado PROVISÓRIO: sem fonte verificada na aba FONTES.");
  return {v:r,un:uc,m};
}

/* ================= PREÇO LIMITE ================= */
function precoLimite(ref,aval,p,precoRef){
  const a=get(ref,p), b=get(aval,p);
  const m={ent:[[`Preço de ${ref}`,brl(precoRef)+" por tonelada"],
                [`${p} em ${ref}`,(a.v===null?"N/D":fmt(a.v)+" "+a.un)+` — fonte: ${fonteTxt(a)}`],
                [`${p} em ${aval}`,(b.v===null?"N/D":fmt(b.v)+" "+b.un)+` — fonte: ${fonteTxt(b)}`]],
           form:"",passos:[],res:null,blk:null,avisos:[]};
  if(!precoRef||precoRef<=0){m.blk=`preço de ${ref} não informado.`;return{v:null,m}}
  if(a.v===null||b.v===null){m.blk=`${p} de ${a.v===null?ref:aval} está N/D na planilha.`;return{v:null,m}}
  if(a.v<=0){m.blk=`${p} de ${ref} é zero; a razão seria indefinida.`;return{v:null,m}}
  if(a.un!==b.un){m.blk=`unidades incompatíveis: ${ref} em "${a.un}" e ${aval} em "${b.un}".`;return{v:null,m}}
  const razao=b.v/a.v, r=precoRef*razao;
  m.form="Preço limite = Preço da referência × (nutriente do avaliado / nutriente da referência)";
  m.passos.push(`Razão do nutriente: ${fmt(b.v)} / ${fmt(a.v)} = ${fmt(razao)}`);
  m.passos.push(`${brl(precoRef)} × ${fmt(razao)} = ${brl(r)}`);
  m.res=`${brl(r)} por tonelada`;
  m.avisos.push(`Este é o preço equivalente EM ${p.toUpperCase()}, não um preço justo global. Outro nutriente daria outro limite.`);
  if(a.prov||b.prov) m.avisos.push("Há dado PROVISÓRIO neste cálculo.");
  return {v:r,m};
}

function faixa(ref,av){return FAIXAS.find(f=>f.ref===ref&&f.av===av)||null}

/* ================= FORMULAÇÃO ================= */
/* f = {ingrediente: % de inclusão}, precos = {ingrediente: R$/ton}
   semCusto = ingredientes que o usuário decidiu deixar FORA do custo (ex.:
   Núcleo + Ureia). É uma exclusão declarada e mostrada no memorial — diferente
   de preço faltando, que continua invalidando a conta. */
function custoFormulacao(f,precos,semCusto=[]){
  const m={ent:[],form:"Custo = soma de (preço do ingrediente × % de inclusão / 100)",
           passos:[],res:null,blk:null,avisos:[]};
  let t=0,bad=false;
  for(const c in f){ if(f[c]<=0) continue;
    if(semCusto.includes(c)){
      m.passos.push(`${c}: ${fmt(f[c])}% — fora do custo (sem preço, por definição)`);
      m.avisos.push(`${c} (${fmt(f[c])}%) não entra no custo. O valor é o custo dos demais ingredientes por tonelada de ração.`);
      continue}
    const p=precos[c];
    if(!p||p<=0){m.avisos.push(`Preço de ${c} não informado; ingrediente ignorado.`);bad=true;continue}
    const x=p*f[c]/100; t+=x; m.passos.push(`${c}: ${brl(p)} × ${fmt(f[c])}% = ${brl(x)}`);
  }
  m.res=`${brl(t)} por tonelada`;
  if(bad) m.avisos.push("Custo incompleto: há ingrediente sem preço.");
  return {v:bad?null:t,m};
}

/* semPerfil = ingredientes SEM perfil nutricional cadastrado, por decisão do
   usuário (ex.: Núcleo + Ureia). Ficam fora da soma, com aviso explícito no
   memorial — o resultado é a contribuição dos DEMAIS ingredientes, não o perfil
   da ração. Isso NÃO é "dado ausente virou zero": um ingrediente fora dessa
   lista e sem dado continua bloqueando o cálculo (N/D). */
function avisoSemPerfil(f,semPerfil,m){
  semPerfil.filter(c=>(f[c]||0)>0).forEach(c=>m.avisos.push(
    `${c} (${fmt(f[c])}%) não tem perfil nutricional cadastrado e ficou fora da soma. `+
    `O valor é a contribuição dos demais ingredientes, não o total da ração.`));
}
function nutriFormulacao(f,p,semPerfil=[]){
  const mt=meta(p); const un=mt.un;
  const m={ent:[],form:"",passos:[],res:null,blk:null,avisos:[]};
  avisoSemPerfil(f,semPerfil,m);
  if(un.toLowerCase().includes("da pb")) return fracaoPB(f,p,un,m,semPerfil);
  m.form="Valor = soma de (valor do ingrediente em matéria natural × % de inclusão / 100)";
  let t=0;
  for(const c in f){ if(f[c]<=0) continue;
    if(semPerfil.includes(c)) continue;
    const d=get(c,p);
    if(d.v===null){m.blk=`${p} de ${c} está N/D. Com inclusão de ${fmt(f[c])}%, somar sem esse dado produziria um total subestimado.`;return{v:null,un,m}}
    const mn=toMN(c,p);
    if(mn.v===null){m.blk=`não foi possível converter ${p} de ${c} para matéria natural: Matéria Seca ausente.`;return{v:null,un,m}}
    const x=mn.v*f[c]/100; t+=x;
    m.passos.push(`${c}: ${fmt(mn.v)} × ${fmt(f[c])}% = ${fmt(x)}`+
      (d.base==="MS"?` [conversão MS→MN: ${mn.nota}]`:"")+` — fonte: ${fonteTxt(d)}`);
  }
  m.res=`${fmt(t)} ${un} (matéria natural)`;
  return {v:t,un,m};
}

/* PDR/PNDR: ponderados pela proteína que cada ingrediente aporta */
function fracaoPB(f,p,un,m,semPerfil=[]){
  m.form="Valor = soma de (fração do ingrediente × proteína que ele aporta) / proteína total da ração";
  m.avisos.push("Parâmetro expresso em % da PB. A média é ponderada pela proteína aportada por cada ingrediente, não pela massa. Ponderar pela massa daria um número inflado por ingredientes de baixa proteína.");
  let sp=0,spb=0;
  for(const c in f){ if(f[c]<=0) continue;
    if(semPerfil.includes(c)) continue;
    const d=get(c,p), pb=toMN(c,"Proteína Bruta");
    if(d.v===null||pb.v===null){m.blk=`${d.v===null?p:"Proteína Bruta"} de ${c} está N/D.`;return{v:null,un,m}}
    const ap=pb.v*f[c]/100; spb+=ap; sp+=d.v*ap;
    m.passos.push(`${c}: aporta ${fmt(ap)}% de PB na ração, com ${p} = ${fmt(d.v)}% da PB`);
  }
  if(spb<=0){m.blk="proteína total da ração é zero.";return{v:null,un,m}}
  const t=sp/spb;
  m.passos.push(`${fmt(sp)} / ${fmt(spb)} = ${fmt(t)}`);
  m.res=`${fmt(t)} ${un}`;
  return {v:t,un,m};
}

function totalDe(f,ings){return ings.reduce((a,c)=>a+(f[c]||0),0)}
function arred(x){return Math.round(x*100)/100}

/* ================= VÍNCULOS ENTRE INGREDIENTES =================
   Cada relação guarda um FATOR: quantos pontos de "para" se movem para
   cada 1 ponto de "de". Fator 1,0 é a troca 1:1. Fator 1,6 significa que
   1 ponto de "de" desloca 1,6 pontos de "para".
   Consequência: com fator diferente de 1 o TOTAL da formulação muda,
   porque o que entra e o que sai não são iguais. Isso é proposital e
   aparece na barra de total.
   rels = [{de, para, ratio, on}], ings = ingredientes selecionados.   */
function vinculosDe(c,rels,ings){
  const m=new Map();
  rels.forEach(r=>{
    if(!r.on) return;
    if(!ings.includes(r.de)||!ings.includes(r.para)) return;
    if(r.de===c && !m.has(r.para)) m.set(r.para, r.ratio);
    else if(r.para===c && !m.has(r.de)) m.set(r.de, r.ratio>1e-9?1/r.ratio:0);
  });
  return [...m].map(([p,R])=>({p,R}));
}

/* Move um ingrediente da formulação f respeitando seus vínculos.
   O deslocamento é limitado pelo que cada parceiro pode ceder ou receber
   e pelo teto de 100% do total. Altera f e devolve o valor aplicado. */
function moverVinculado(f,c,novo,rels,ings){
  novo=Math.max(0,Math.min(100,novo));
  const ant=f[c]||0;
  let d=novo-ant;
  const v=vinculosDe(c,rels,ings);
  if(!v.length||Math.abs(d)<1e-9){ f[c]=arred(novo); return f[c] }

  // limite imposto por cada parceiro: não pode passar de 0 nem de 100
  v.forEach(({p,R})=>{
    if(Math.abs(R)<1e-9) return;
    const cur=f[p]||0;
    if(d>0){ const lim=cur/R;          if(lim<d) d=lim }
    else   { const lim=(cur-100)/R;    if(lim>d) d=lim }
  });

  // limite imposto pelo total: com fator != 1 a soma se move
  const k=1-v.reduce((a,x)=>a+x.R,0);
  if(Math.abs(k)>1e-9){
    const tot=totalDe(f,ings);
    if(d*k>0){
      const max=(100-tot)/k;
      if(k>0 && d>max) d=Math.max(0,max);
      if(k<0 && d<max) d=Math.min(0,max);
    }
  }
  if(!isFinite(d)) d=0;

  v.forEach(({p,R})=>{f[p]=arred(Math.max(0,Math.min(100,(f[p]||0)-d*R)))});
  f[c]=arred(Math.max(0,Math.min(100,ant+d)));
  return f[c];
}

/* ================= COMPLETAR AUTOMATICAMENTE (v3) =================
   Problema: o usuário trava alguns ingredientes da reestruturada e pede que
   o sistema preencha os demais ("livres") de modo que
     (1) o total feche no MESMO total da formulação original;
     (2) o nutriente escolhido (ex.: Proteína Bruta) fique a no máximo
         `tol` PONTOS do valor da original;
     (3) entre todas as combinações que atendem (1) e (2), o custo seja o menor.

   É um problema de programação linear com 1 igualdade (total) e 1 faixa
   (nutriente). Nesse formato, a melhor solução sempre usa NO MÁXIMO 2
   ingredientes livres com quantidade maior que zero:
     - 1 ingrediente sozinho fechando o total, se o nutriente cair na faixa; ou
     - 2 ingredientes, com o nutriente exatamente no piso ou no teto da faixa.
   Então basta testar todos os ingredientes sozinhos e todos os pares, e ficar
   com o mais barato. Sem biblioteca, sem aproximação, e cada candidato pode
   ser conferido à mão (aparecem no memorial).

   Ingredientes em `semPerfil` (ex.: Núcleo + Ureia) são sempre mantidos como
   estão e não contam no nutriente — nem na original, nem na reestruturada —
   por isso precisam ter o mesmo percentual nas duas para a comparação valer.

   Não altera nada: devolve {f: nova formulação ou null, m: memorial, ...}.  */
function completarPorCusto(o){
  const {fOrig,fAtual,ings,travados,precos,nutriente,tol}=o;
  const semPerfil=o.semPerfil||[];
  const m={ent:[],form:"",passos:[],res:null,blk:null,avisos:[]};
  const falha=t=>{m.blk=t;return {f:null,m}};
  const mt=meta(nutriente);
  if(!mt) return falha(`parâmetro "${nutriente}" não existe na base.`);
  if(mt.un.toLowerCase().includes("da pb"))
    return falha(`${nutriente} é uma fração da proteína (${mt.un}) e não pode ser usado como meta.`);
  if(!(tol>=0)) return falha("tolerância inválida.");

  const sub=f=>{const r={};ings.forEach(c=>r[c]=f[c]||0);return r};
  const total=arred(totalDe(fOrig,ings));
  if(total<=0) return falha("a formulação original está vazia.");
  if(total>100.001) return falha("a formulação original passa de 100%.");
  const alvo=nutriFormulacao(sub(fOrig),nutriente,semPerfil);
  if(alvo.v===null) return falha(`não foi possível calcular ${nutriente} da original: ${alvo.m.blk}`);

  const fixos=ings.filter(c=>travados.includes(c)||semPerfil.includes(c));
  const livres=ings.filter(c=>!fixos.includes(c));
  if(!livres.length) return falha("todos os ingredientes estão travados. Destrave pelo menos um para o sistema ajustar.");

  // o que os mantidos já ocupam e já aportam
  let somaFix=0,nutFix=0;
  for(const c of fixos){const v=fAtual[c]||0; somaFix+=v;
    if(semPerfil.includes(c)||v<=0) continue;
    const mn=toMN(c,nutriente);
    if(mn.v===null) return falha(`${nutriente} de ${c} está N/D; não dá para saber quanto ele aporta.`);
    nutFix+=mn.v*v/100;
  }
  const R=total-somaFix;                     // pontos que os livres precisam somar
  if(R<-0.001) return falha(`os ingredientes travados somam ${fmt(somaFix)}% e passam do total de ${fmt(total)}%. Reduza algum travado.`);
  const Rr=Math.max(0,R);

  // aporte por ponto de inclusão (matéria natural) e preço de cada livre
  const a={},pr={};
  for(const c of livres){
    const mn=toMN(c,nutriente);
    if(mn.v===null) return falha(`${nutriente} de ${c} está N/D. Trave esse ingrediente ou cadastre o dado.`);
    a[c]=mn.v/100;
    const p=precos[c];
    if(!p||p<=0) return falha(`preço de ${c} não informado. Informe a cotação ou trave esse ingrediente — o sistema não escolhe o mais barato sem preço.`);
    pr[c]=p;
  }
  const L=alvo.v-tol-nutFix, U=alvo.v+tol-nutFix;   // faixa que os livres precisam aportar
  const eps=1e-9, cands=[];
  const custoDe=x=>Object.keys(x).reduce((s,c)=>s+pr[c]*x[c]/100,0);
  const nutDe=x=>Object.keys(x).reduce((s,c)=>s+a[c]*x[c],0);

  // 1 ingrediente sozinho. Folga de 0,005 ponto (metade da precisão de 2 casas
  // mostrada na tela): percentuais arredondados a 2 casas deslocam o nutriente
  // na 4ª casa, e sem a folga um resultado do próprio sistema seria recusado.
  const folga=0.005;
  livres.forEach(c=>{const n=a[c]*Rr; if(n>=L-folga&&n<=U+folga) cands.push({[c]:Rr})});
  // pares, com o nutriente no piso ou no teto da faixa
  const metas=tol>eps?[L,U]:[L];
  for(let i=0;i<livres.length;i++) for(let j=i+1;j<livres.length;j++){
    const ci=livres[i],cj=livres[j], d=a[ci]-a[cj];
    if(Math.abs(d)<1e-12) continue;
    metas.forEach(alv=>{
      const xi=(alv-a[cj]*Rr)/d, xj=Rr-xi;
      if(xi>eps&&xj>eps) cands.push({[ci]:xi,[cj]:xj});
    });
  }

  const un=mt.un;
  const txt=x=>Object.keys(x).map(c=>`${c} ${fmt(x[c])}%`).join(" + ");
  m.ent=[["Meta",`${nutriente} da original = ${fmt(alvo.v)} ${un} → aceito de ${fmt(alvo.v-tol)} a ${fmt(alvo.v+tol)}`],
         ["Total a fechar",`${fmt(total)}% (o mesmo da original)`],
         ["Mantidos como estão",fixos.length?fixos.map(c=>`${c} ${fmt(fAtual[c]||0)}%`).join("; "):"nenhum"],
         ["Calculados pelo sistema",livres.map(c=>`${c} (${nutriente} ${fmt(a[c]*100)} ${un} na MN, ${brl(pr[c])}/t)`).join("; ")]];
  m.form="Entre as combinações dos ingredientes livres que fecham o total e mantêm o nutriente na faixa, escolher a de menor custo";
  avisoSemPerfil(sub(fAtual),semPerfil,m);

  if(!cands.length){
    const as=livres.map(c=>a[c]*Rr+nutFix), mn=Math.min(...as), mx=Math.max(...as);
    return falha(`não existe combinação que atenda. Com os ingredientes livres (${livres.join(", ")}) fechando ${fmt(Rr)}%, `+
      `${nutriente} ${fmt(mn)===fmt(mx)?`fica em ${fmt(mn)}`:`vai de ${fmt(mn)} a ${fmt(mx)}`} ${un}, e a meta é de `+
      `${fmt(alvo.v-tol)} a ${fmt(alvo.v+tol)}. Destrave outro ingrediente, mude um travado ou aumente a tolerância.`);
  }
  cands.sort((x,y)=>custoDe(x)-custoDe(y));
  const melhor=cands[0];
  cands.slice(0,8).forEach((x,k)=>m.passos.push(
    `${k===0?"✔ ":""}${txt(x)} → ${nutriente} ${fmt(nutDe(x)+nutFix)} ${un}, custo destes ${brl(custoDe(x))}/t${k===0?" (menor custo)":""}`));
  if(cands.length>8) m.passos.push(`… e mais ${cands.length-8} combinações mais caras.`);

  // monta a formulação, arredonda a 2 casas e acerta o centavo de arredondamento no maior
  const f=sub(fAtual);
  livres.forEach(c=>f[c]=arred(melhor[c]||0));
  const dif=arred(Rr-livres.reduce((s,c)=>s+f[c],0));
  if(Math.abs(dif)>0){const maior=livres.reduce((x,y)=>f[y]>f[x]?y:x); f[maior]=arred(f[maior]+dif)}

  const obtido=nutriFormulacao(f,nutriente,semPerfil).v;
  m.res=`${livres.map(c=>`${c} ${fmt(f[c])}%`).join(", ")} → ${nutriente} ${fmt(obtido)} ${un} `+
        `(original ${fmt(alvo.v)}; diferença ${arred(obtido-alvo.v)>0?"+":""}${fmt(obtido-alvo.v)})`;
  if(tol>eps) m.avisos.push("O menor custo costuma ficar no limite da tolerância: o sistema usa a folga que você deu. Para ficar mais perto da original, reduza a tolerância.");
  m.avisos.push(`Só ${nutriente} foi preservado. Os outros nutrientes podem ter mudado — confira na comparação abaixo.`);
  return {f,m,alvo:alvo.v,obtido,custoLivres:custoDe(melhor)};
}
