/* =============================================================
   CONFIGURAÇÃO DO SUPABASE
   -------------------------------------------------------------
   1. Crie um projeto em https://supabase.com
   2. Rode o arquivo schema.sql no SQL Editor
   3. Em "Project Settings → API", copie:
      - "Project URL"      → cole em SUPABASE_URL
      - "anon public" key  → cole em SUPABASE_ANON_KEY
   ============================================================= */
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "SUA-CHAVE-ANON-PUBLICA";

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
