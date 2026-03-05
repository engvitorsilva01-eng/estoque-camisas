// ========= CONFIG =========
const DEFAULT_OWNER = "engvitorsilva01-eng";
const DEFAULT_REPO  = "estoque-camisas";

// Se você quiser esconder o campo de usuário/repo depois, coloque true:
const HIDE_REPO_BOX = false;

// ========= UI HELPERS =========
const $ = (id) => document.getElementById(id);

function setPill(text, kind="idle"){
  const pill = $("pillStatus");
  pill.textContent = text;
  pill.style.color = kind==="ok" ? "var(--ok)" : kind==="warn" ? "var(--warn)" : kind==="bad" ? "var(--bad)" : "var(--muted)";
  pill.style.borderColor = "var(--line)";
}

function showNote(msg, kind="idle"){
  const note = $("note");
  note.style.display = "block";
  note.style.color = kind==="ok" ? "var(--ok)" : kind==="warn" ? "var(--warn)" : kind==="bad" ? "var(--bad)" : "var(--muted)";
  note.textContent = msg;
}

function hideNote(){
  const note = $("note");
  note.style.display = "none";
  note.textContent = "";
}

// ========= CSV? NÃO. ISSUES =========
function moneyBRL(v){
  if(!isFinite(v)) return "";
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function uniq(arr){
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function badgeStatus(state){
  const label = state === "open" ? "Em estoque" : "Vendido/Esgotado";
  return `<span class="badge">${label}</span>`;
}

/**
 * Parseia o body da Issue no formato:
 * time: Flamengo
 * modelo: 2026
 * versao: Torcedor
 * cor: Vermelha
 * tamanho: GG
 * quantidade: 2
 * preco: 130
 * observacao: pronta entrega
 *
 * Aceita variações (ex.: "preço" -> "preco", "tam" -> "tamanho")
 */
function parseIssueBody(body){
  const out = {};
  const lines = (body || "").split(/\r?\n/);

  for(const line of lines){
    const m = line.match(/^\s*([^:]{1,40})\s*:\s*(.+)\s*$/);
    if(!m) continue;

    let key = m[1].trim().toLowerCase();
    const val = m[2].trim();

    // normaliza acentos simples
    key = key
      .replaceAll("ç","c")
      .replaceAll("ã","a").replaceAll("á","a").replaceAll("à","a").replaceAll("â","a")
      .replaceAll("é","e").replaceAll("ê","e")
      .replaceAll("í","i")
      .replaceAll("ó","o").replaceAll("ô","o")
      .replaceAll("ú","u");

    // sinônimos
    if(key === "preco" || key === "preco_r$" || key === "valor") key = "preco";
    if(key === "tam" || key === "tamanho" || key === "size") key = "tamanho";
    if(key === "qtd" || key === "quantidade" || key === "quant") key = "quantidade";
    if(key === "versao" || key === "tipo") key = "versao";
    if(key === "obs" || key === "observacao") key = "observacao";

    out[key] = val;
  }

  return out;
}

function normalizeIssue(issue){
  const fields = parseIssueBody(issue.body || "");
  const quantidade = Number((fields.quantidade || "0").replace(",", "."));
  const preco = Number((fields.preco || "0").replace(",", "."));

  return {
    time: fields.time || "",
    modelo: fields.modelo || "",
    versao: fields.versao || "",
    cor: fields.cor || "",
    tamanho: fields.tamanho || "",
    quantidade: isFinite(quantidade) ? quantidade : 0,
    preco: isFinite(preco) ? preco : 0,
    observacao: fields.observacao || "",
    status: issue.state // open/closed
  };
}

function renderKpis(items){
  const totalPecas = items.reduce((a,x)=>a + (x.quantidade||0), 0);
  const emEstoque = items.filter(x=>x.status==="open").reduce((a,x)=>a+(x.quantidade||0),0);
  const vendidos = items.filter(x=>x.status==="closed").reduce((a,x)=>a+(x.quantidade||0),0);
  const valorEstoque = items
    .filter(x=>x.status==="open")
    .reduce((a,x)=>a + (x.preco||0)*(x.quantidade||0), 0);

  $("kpis").innerHTML = `
    <div class="kpi"><div class="label">Peças (todas)</div><div class="value">${totalPecas}</div></div>
    <div class="kpi"><div class="label">Em estoque</div><div class="value">${emEstoque}</div></div>
    <div class="kpi"><div class="label">Vendidas</div><div class="value">${vendidos}</div></div>
    <div class="kpi"><div class="label">Valor em estoque</div><div class="value">${moneyBRL(valorEstoque)}</div></div>
  `;
}

function renderTable(items){
  $("rows").innerHTML = items.map(x=>`
    <tr>
      <td>${x.time || "-"}</td>
      <td>${x.modelo || "-"}</td>
      <td>${x.versao || "-"}</td>
      <td>${x.cor || "-"}</td>
      <td>${x.tamanho || "-"}</td>
      <td>${x.quantidade ?? 0}</td>
      <td>${moneyBRL(x.preco || 0)}</td>
      <td>${badgeStatus(x.status)}</td>
      <td>${x.observacao || ""}</td>
    </tr>
  `).join("");
}

function fillSelect(id, values){
  const sel = $(id);
  const keep = sel.value;
  sel.innerHTML = sel.options[0].outerHTML + values.map(v => `<option value="${v}">${v}</option>`).join("");
  sel.value = keep;
}

function applyFilters(base){
  const q = ($("q").value || "").toLowerCase().trim();
  const fTime = $("fTime").value;
  const fModelo = $("fModelo").value;
  const fTamanho = $("fTamanho").value;
  const fStatus = $("fStatus").value;

  return base.filter(x=>{
    if(fTime && x.time !== fTime) return false;
    if(fModelo && x.modelo !== fModelo) return false;
    if(fTamanho && x.tamanho !== fTamanho) return false;
    if(fStatus && x.status !== fStatus) return false;

    if(q){
      const blob = `${x.time} ${x.modelo} ${x.versao} ${x.cor} ${x.tamanho} ${x.observacao}`.toLowerCase();
      if(!blob.includes(q)) return false;
    }
    return true;
  });
}

// ========= GITHUB API (com paginação) =========
function parseLinkHeader(link){
  // Ex: <...page=2>; rel="next", <...page=4>; rel="last"
  const out = {};
  if(!link) return out;
  const parts = link.split(",");
  for(const p of parts){
    const m = p.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if(m) out[m[2]] = m[1];
  }
  return out;
}

async function fetchJSON(url){
  const r = await fetch(url, {
    headers: { "Accept":"application/vnd.github+json" },
    cache: "no-store"
  });

  // Rate limit e erros comuns
  if(r.status === 403){
    const txt = await r.text();
    throw new Error("403 (bloqueado). Pode ser limite da API ou repo privado. Detalhe: " + txt.slice(0,120));
  }
  if(r.status === 404){
    throw new Error("404. Repo não encontrado (ou está privado).");
  }
  if(!r.ok){
    throw new Error(`Erro ${r.status}. Não deu pra buscar as Issues.`);
  }

  const data = await r.json();
  const link = r.headers.get("link");
  return { data, link };
}

async function fetchAllIssues(owner, repo, state){
  // state: open | closed
  let url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=100&sort=updated&direction=desc`;
  const all = [];

  while(url){
    const { data, link } = await fetchJSON(url);

    // remove PRs (aparecem junto)
    const onlyIssues = data.filter(x => !x.pull_request);
    all.push(...onlyIssues);

    const links = parseLinkHeader(link);
    url = links.next || null;
  }

  return all;
}

let BASE_ITEMS = [];
let WIRED = false;

function wireFiltersOnce(){
  if(WIRED) return;
  WIRED = true;

  const rerender = ()=>{
    const filtered = applyFilters(BASE_ITEMS);
    renderKpis(filtered);
    renderTable(filtered);
  };

  ["q","fTime","fModelo","fTamanho","fStatus"].forEach(id=>{
    $(id).addEventListener("input", rerender);
    $(id).addEventListener("change", rerender);
  });
}

async function load(){
  hideNote();
  setPill("Carregando...", "warn");
  $("btnLoad").disabled = true;

  const owner = $("owner").value.trim();
  const repo  = $("repo").value.trim();

  if(!owner || !repo){
    $("btnLoad").disabled = false;
    setPill("Preencha usuário/repo", "bad");
    showNote("Preencha Usuário e Repositório, depois clique Carregar.", "bad");
    return;
  }

  try{
    // Pega open e closed com paginação
    const [openIssues, closedIssues] = await Promise.all([
      fetchAllIssues(owner, repo, "open"),
      fetchAllIssues(owner, repo, "closed")
    ]);

    const issues = [...openIssues, ...closedIssues];
    const items = issues
      .map(normalizeIssue)
      // mantém só itens com algum campo útil
      .filter(x => x.time || x.modelo || x.versao || x.tamanho || x.cor || x.observacao);

    BASE_ITEMS = items;

    // preencher filtros
    fillSelect("fTime", uniq(items.map(x=>x.time)));
    fillSelect("fModelo", uniq(items.map(x=>x.modelo)));
    fillSelect("fTamanho", uniq(items.map(x=>x.tamanho)));

    wireFiltersOnce();

    const filtered = applyFilters(items);
    renderKpis(filtered);
    renderTable(filtered);

    $("updated").textContent = `Carregado em: ${new Date().toLocaleString("pt-BR")} • Itens: ${items.length}`;
    $("hint").textContent =
      `Modelo de cadastro (Issue):
time: Flamengo
modelo: 2026
versao: Torcedor
cor: Vermelha
tamanho: GG
quantidade: 2
preco: 130
observacao: pronta entrega`;

    if(items.length === 0){
      showNote("Carregou, mas ainda não tem Issues no formato campo: valor. Crie uma Issue em Issues → New issue.", "warn");
      setPill("Sem itens ainda", "warn");
    }else{
      setPill("OK", "ok");
    }
  }catch(err){
    setPill("Erro", "bad");

    // mensagens mais claras
    const msg = String(err?.message || err);

    if(msg.includes("repo privado") || msg.includes("404")){
      showNote("Não consegui ler as Issues. Confere se o repositório é PUBLIC e se o nome está certo.", "bad");
    }else if(msg.includes("403")){
      showNote("Erro 403. Pode ser limite da API do GitHub (muitas visitas) ou algum bloqueio. Tente de novo depois. Se continuar, a gente coloca token.", "bad");
    }else{
      showNote("Erro ao carregar: " + msg, "bad");
    }
  }finally{
    $("btnLoad").disabled = false;
  }
}

// ========= START =========
$("btnLoad").addEventListener("click", load);

window.addEventListener("load", () => {
  // Preenche automático
  $("owner").value = DEFAULT_OWNER;
  $("repo").value  = DEFAULT_REPO;

  if(HIDE_REPO_BOX){
    $("repoBox").style.display = "none";
  }

  // Carrega automático
  load();
});
