/* =============================================================
   CONFIGURAÇÃO DO SUPABASE
   -------------------------------------------------------------
   1. Crie um projeto em https://supabase.com
   2. Rode o arquivo schema.sql no SQL Editor
   3. Em "Project Settings → API", copie:
      - "Project URL"      → cole em SUPABASE_URL
      - "anon public" key  → cole em SUPABASE_ANON_KEY
   ============================================================= */
const SUPABASE_URL = "https://vsnfqohptlporesdfrtx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BGdjIkL0pTXSOTyIB6wxAg_zlao5meF";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =============================================================
   CONSTANTES COMPARTILHADAS
   ============================================================= */
const ROLES = [
  { key: "sdr", label: "SDR" },
  { key: "closer", label: "Closer" },
  { key: "customer_success", label: "Customer Success" }
];
const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.key, r.label]));

const BLOCK_TYPES = {
  prospeccao: "Prospecção",
  ligacoes: "Ligações / Atendimento",
  followup: "Follow-up",
  conteudo: "Conteúdo",
  reuniao: "Reunião interna",
  pausa: "Pausa"
};

const DAY_LABELS = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };
const DAY_LABELS_SHORT = { 1: "SEG", 2: "TER", 3: "QUA", 4: "QUI", 5: "SEX", 6: "SÁB" };

/* =============================================================
   HELPERS GERAIS
   ============================================================= */
function slugify(text) {
  return text
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function initialsFromName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateDisplay(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d).replace(".", "").toUpperCase();
  return `${wd} · ${formatDateBR(isoDate)}`;
}

/* Retorna {cls,label} para destacar eventos de hoje/em breve/agora, ou null se não for hoje */
function eventBadge(ev) {
  const today = new Date().toISOString().slice(0, 10);
  if (ev.event_date !== today) return null;
  if (ev.is_all_day) return { cls: "today", label: "Hoje" };
  const now = new Date();
  const start = new Date(`${ev.event_date}T${ev.start_time}`);
  const end = new Date(`${ev.event_date}T${ev.end_time}`);
  if (now >= start && now < end) return { cls: "now", label: "Agora" };
  if (now < start) {
    const diffMin = Math.round((start - now) / 60000);
    if (diffMin <= 120) {
      const label = diffMin < 60 ? `Em ${diffMin}min` : `Em ${Math.floor(diffMin / 60)}h${diffMin % 60 ? (diffMin % 60) + "min" : ""}`;
      return { cls: "soon", label };
    }
  }
  return { cls: "today", label: "Hoje" };
}

/* =============================================================
   TEAM MEMBERS
   ============================================================= */
async function fetchTeamMembers() {
  const { data, error } = await db.from("team_members").select("*").order("name");
  if (error) throw error;
  return data;
}

async function fetchTeamMemberBySlug(slug) {
  const { data, error } = await db.from("team_members").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchTeamMemberById(id) {
  const { data, error } = await db.from("team_members").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/* Cria uma pessoa, gerando slug único automaticamente a partir do nome */
async function createTeamMember({ name, role }) {
  const baseSlug = slugify(name) || "membro";
  const initials = initialsFromName(name);

  let slug = baseSlug;
  let n = 2;
  while (await fetchTeamMemberBySlug(slug)) {
    slug = `${baseSlug}-${n++}`;
  }

  const { data, error } = await db
    .from("team_members")
    .insert({ name, role, slug, initials })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateTeamMember(id, fields) {
  const { error } = await db.from("team_members").update(fields).eq("id", id);
  if (error) throw error;
}

async function deleteTeamMember(id) {
  const { error } = await db.from("team_members").delete().eq("id", id);
  if (error) throw error;
}

/* =============================================================
   ROTINA FIXA (routine_blocks)
   ============================================================= */
async function fetchRoutineBlocks(teamMemberId) {
  const { data, error } = await db
    .from("routine_blocks")
    .select("*")
    .eq("team_member_id", teamMemberId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return data;
}

async function fetchAllRoutineBlocks() {
  const { data, error } = await db.from("routine_blocks").select("*");
  if (error) throw error;
  return data;
}

async function createRoutineBlock(block) {
  const { error } = await db.from("routine_blocks").insert(block);
  if (error) throw error;
}

async function deleteRoutineBlock(id) {
  const { error } = await db.from("routine_blocks").delete().eq("id", id);
  if (error) throw error;
}

/* Agrupa uma lista de blocos por dia da semana: { 1: [...], 2: [...] , ... } */
function groupBlocksByDay(blocks) {
  const byDay = {};
  for (let d = 0; d <= 6; d++) byDay[d] = [];
  blocks.forEach(b => byDay[b.day_of_week].push(b));
  return byDay;
}

/* =============================================================
   EVENTOS E CONVITES
   ============================================================= */
const EVENT_SELECT = "*, team_members(name), event_attendees(team_member_id, team_members(id, name, initials))";

/* Eventos onde a pessoa é criadora OU convidada, ordenados por data/hora */
async function fetchEventsForMember(teamMemberId) {
  const { data: created, error: e1 } = await db
    .from("events")
    .select(EVENT_SELECT)
    .eq("created_by", teamMemberId);
  if (e1) throw e1;

  const { data: invitedRows, error: e2 } = await db
    .from("event_attendees")
    .select("event_id")
    .eq("team_member_id", teamMemberId);
  if (e2) throw e2;

  let invited = [];
  const invitedIds = invitedRows.map(r => r.event_id);
  if (invitedIds.length) {
    const { data, error: e3 } = await db
      .from("events")
      .select(EVENT_SELECT)
      .in("id", invitedIds);
    if (e3) throw e3;
    invited = data;
  }

  const map = new Map();
  [...created, ...invited].forEach(ev => map.set(ev.id, ev));

  return Array.from(map.values()).sort((a, b) => {
    const ka = a.event_date + " " + a.start_time;
    const kb = b.event_date + " " + b.start_time;
    return ka.localeCompare(kb);
  });
}

async function createEvent(event, attendeeIds) {
  const { data, error } = await db.from("events").insert(event).select().single();
  if (error) throw error;

  if (attendeeIds && attendeeIds.length) {
    const rows = attendeeIds.map(id => ({ event_id: data.id, team_member_id: id }));
    const { error: e2 } = await db.from("event_attendees").insert(rows);
    if (e2) throw e2;
  }
  return data;
}

async function deleteEvent(id) {
  const { error } = await db.from("events").delete().eq("id", id);
  if (error) throw error;
}

/* Eventos de todo o time nos próximos `daysAhead` dias (inclui hoje), com criador e convidados */
async function fetchUpcomingEvents(daysAhead = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("events")
    .select("*, team_members!events_created_by_fkey(id,name,initials), event_attendees(team_members(id,name,initials))")
    .gte("event_date", today)
    .lte("event_date", future)
    .order("event_date")
    .order("start_time");
  if (error) throw error;
  return data || [];
}
