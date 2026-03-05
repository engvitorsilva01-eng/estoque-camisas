function moneyBRL(v){
  if(!isFinite(v)) return "";
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}
function uniq(arr){ return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b)); }

function parseBody(body){
  const out = {};
  (body || "").split(/\r?\n/).forEach(line=>{
    const m = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)\s*$/);
    if(!m) return;
    const k = m[1].toLowerCase().trim();
    const v = m[2].trim();
    out[k] = v;
  });
  return out;
}

function badgeStatus(state){
  const label = state === "open" ? "Em estoque" : "Vendido/Esgotado";
  return `<span class="badge">${label}</span>`;
}

function fillSelect(id, values){
  const sel = document.getElementById(id);
  const keep = sel.value;
  sel.innerHTML = sel.options[0].outerHTML + values.map(v => `<option value="${v}">${v}</option>`).join("");
  sel.value = keep;
}

function renderKpis(items){
  const totalPecas = items.reduce((a,x)=>a + (x.quantidade||0), 0);
  const emEstoque = items.filter(x=>x.status==="open").reduce((a,x)=>a+(x.quantidade||0),0);
  const vendidos = items.filter(x=>x.status==="closed").reduce((a,x)=>a+(x.quantidade||0),0);
  const valorEstoque = items.filter(x=>x.status==="open").reduce((a,x)=>a + (x.preco||0)*(x.quantidade||0), 0);

  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="label">Peças (todas)</div><div class="value">${totalPecas}</div></div>
    <div class="kpi"><div class="label">Em estoque</div><div class="value">${emEstoque}</div></div>
    <div class="kpi"><div class="label">Vendidas</div><div class="value">${vendidos}</div></div>
    <div class="kpi"><div class="label">Valor em estoque</div><div class="value">${moneyBRL(valorEstoque)}</div></div>
  `;
}

function renderTable(items){
  const tbody = document.getElementById("rows");
  tbody.innerHTML = items.map(x=>`
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

function applyFilters(base){
  const q = (document.getElementById("q").value || "").toLowerCase().trim();
  const fTime = document.getElementById("fTime").value;
  const fModelo = document.getElementById("fModelo").value;
  const fTamanho = document.getElementById("fTamanho").value;
  const fStatus = document.getElementById("fStatus").value;

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

async function fetchAllIssues(owner, repo){
  const endpoints = [
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
    `https://api.github.com/repos/${owner}/${repo}/issues?state=closed&per_page=100`
  ];

  const all = [];
  for(const url of endpoints){
    const r = await fetch(url, { headers: { "Accept":"application/vnd.github+json" } });
    if(!r.ok) throw new Error("Falha ao buscar Issues. Verifique usuário/repo e se o repo é público.");
    const data = await r.json();
    all.push(...data.filter(x=>!x.pull_request));
  }
  return all;
}

function normalizeIssue(issue){
  const fields = parseBody(issue.body || "");
  const quantidade = Number(fields.quantidade || 0);
  const preco = Number(fields.preco || 0);

  return {
    time: fields.time || "",
    modelo: fields.modelo || "",
    versao: fields.versao || "",
    cor: fields.cor || "",
    tamanho: fields.tamanho || "",
    quantidade: isFinite(quantidade) ? quantidade : 0,
    preco: isFinite(preco) ? preco : 0,
    observacao: fields.observacao || "",
    status: issue.state
  };
}

async function load(){
  const owner = document.getElementById("owner").value.trim();
  const repo = document.getElementById("repo").value.trim();
  if(!owner || !repo) throw new Error("Preencha usuário e repositório.");

  const issues = await fetchAllIssues(owner, repo);
  const items = issues.map(normalizeIssue).filter(x=>x.time || x.modelo || x.tamanho);

  fillSelect("fTime", uniq(items.map(x=>x.time)));
  fillSelect("fModelo", uniq(items.map(x=>x.modelo)));
  fillSelect("fTamanho", uniq(items.map(x=>x.tamanho)));

  const rerender = ()=>{
    const filtered = applyFilters(items);
    renderKpis(filtered);
    renderTable(filtered);
  };

  ["q","fTime","fModelo","fTamanho","fStatus"].forEach(id=>{
    document.getElementById(id).addEventListener("input", rerender);
    document.getElementById(id).addEventListener("change", rerender);
  });

  rerender();

  document.getElementById("updated").textContent =
    `Carregado em: ${new Date().toLocaleString("pt-BR")}`;

  document.getElementById("hint").textContent =
`Como cadastrar item (Issue):
time: Flamengo
modelo: 2026
versao: Torcedor
cor: Vermelha
tamanho: GG
quantidade: 2
preco: 130
observacao: pronta entrega`;
}

document.getElementById("btnLoad").addEventListener("click", ()=>{
  load().catch(err=>{
    document.getElementById("hint").textContent = `Erro: ${err.message}`;
  });
});
