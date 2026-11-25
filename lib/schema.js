import { q } from "@/lib/db";

// Structure de la base. Chaque instruction est exécutée séparément
// (Neon n'accepte qu'une instruction par requête HTTP).
export const SCHEMA = [
  `create extension if not exists vector`,
  `create table if not exists courses (
    id serial primary key,
    code text,
    title text not null,
    canvas_id text,
    created_at timestamptz default now()
  )`,
  `alter table courses add column if not exists semester int`,
  `create table if not exists modules (
    id serial primary key,
    course_id int not null references courses(id) on delete cascade,
    title text not null,
    position int default 0,
    canvas_id text
  )`,
  `create table if not exists chapters (
    id serial primary key,
    module_id int not null references modules(id) on delete cascade,
    title text not null,
    position int default 0,
    canvas_id text
  )`,
  `create table if not exists documents (
    id serial primary key,
    chapter_id int not null references chapters(id) on delete cascade,
    title text not null,
    kind text default 'reading',
    blob_url text,
    page_count int,
    page_offset int,
    page_confidence real,
    metadata jsonb default '{}'::jsonb,
    intext text,
    reference text,
    status text default 'importing',
    created_at timestamptz default now()
  )`,
  `alter table documents add column if not exists canvas_file_id bigint`,
  `alter table documents add column if not exists canvas_page_url text`,
  `create table if not exists pages (
    id serial primary key,
    document_id int not null references documents(id) on delete cascade,
    pdf_page int not null,
    printed_page text,
    text text
  )`,
  `create index if not exists pages_doc on pages(document_id, pdf_page)`,
  `create table if not exists chunks (
    id serial primary key,
    document_id int not null references documents(id) on delete cascade,
    pdf_page int not null,
    printed_page text,
    content text not null,
    embedding vector(768)
  )`,
  `alter table chunks add column if not exists kind text default 'text'`,
  `create index if not exists chunks_doc on chunks(document_id)`,
  `create index if not exists chunks_embedding on chunks using hnsw (embedding vector_cosine_ops)`,
  `create table if not exists conversations (
    id serial primary key,
    scope_type text not null,
    scope_id int,
    title text,
    created_at timestamptz default now()
  )`,
  `create table if not exists overviews (
    id serial primary key,
    scope_type text not null,
    scope_id int,
    content text not null,
    citations jsonb,
    created_at timestamptz default now()
  )`,
  `create table if not exists sheets (
    id serial primary key,
    chapter_id int not null references chapters(id) on delete cascade,
    kind text not null,
    content text not null,
    citations jsonb,
    words int,
    created_at timestamptz default now()
  )`,
  `create table if not exists sheet_jobs (
    id serial primary key,
    chapter_id int not null references chapters(id) on delete cascade,
    batch_id text not null,
    kinds text not null,
    passages jsonb,
    targets jsonb,
    status text default 'pending',
    error text,
    created_at timestamptz default now(),
    finished_at timestamptz
  )`,
  `create table if not exists works (
    id serial primary key,
    chapter_id int not null references chapters(id) on delete cascade,
    kind text not null default 'selfcheck',
    question text not null,
    target_words int,
    answer text,
    hints jsonb,
    model jsonb,
    critique jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`,
  `create table if not exists api_usage (
    id serial primary key,
    provider text not null,
    model text,
    feature text,
    input_tokens int default 0,
    output_tokens int default 0,
    cache_read int default 0,
    cache_write int default 0,
    batch boolean default false,
    cost_usd numeric(10,5) default 0,
    created_at timestamptz default now()
  )`,
  `create table if not exists settings (
    key text primary key,
    value jsonb
  )`,
  `create table if not exists assignments (
    id serial primary key,
    course_id int references courses(id) on delete cascade,
    title text not null,
    brief text,
    rules jsonb default '{}'::jsonb,
    analysis jsonb,
    brainstorm jsonb,
    thesis text,
    global_critique jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`,
  `create table if not exists assignment_sections (
    id serial primary key,
    assignment_id int not null references assignments(id) on delete cascade,
    position int default 0,
    title text not null,
    brief text,
    words int,
    model jsonb,
    my_text text,
    critique jsonb,
    updated_at timestamptz default now()
  )`,
  `create table if not exists drive_items (
    key text primary key,
    drive_id text not null,
    version text,
    synced_at timestamptz default now()
  )`,
  `create table if not exists messages (
    id serial primary key,
    conversation_id int not null references conversations(id) on delete cascade,
    role text not null,
    content text not null,
    citations jsonb,
    created_at timestamptz default now()
  )`,
  `alter table assignments add column if not exists materials jsonb default '[]'::jsonb`,
  `alter table assignments add column if not exists chat jsonb default '[]'::jsonb`,
  `alter table assignment_sections add column if not exists text_fr text`,
  `alter table assignments add column if not exists literature jsonb`,
  `create table if not exists deliverables (
    id serial primary key,
    scope_type text not null,
    scope_id int,
    kind text not null,
    data jsonb not null,
    created_at timestamptz default now()
  )`,
];

// Crée ou complète les tables si besoin. Exécuté une seule fois par
// démarrage du serveur : plus besoin de cliquer sur « Mettre à jour la base ».
let _ready;
export function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      for (const stmt of SCHEMA) await q(stmt);
    })().catch((err) => {
      _ready = null;
      throw err;
    });
  }
  return _ready;
}
