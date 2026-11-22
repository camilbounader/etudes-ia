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
  `create index if not exists chunks_doc on chunks(document_id)`,
  `create index if not exists chunks_embedding on chunks using hnsw (embedding vector_cosine_ops)`,
  `create table if not exists conversations (
    id serial primary key,
    scope_type text not null,
    scope_id int,
    title text,
    created_at timestamptz default now()
  )`,
  `create table if not exists messages (
    id serial primary key,
    conversation_id int not null references conversations(id) on delete cascade,
    role text not null,
    content text not null,
    citations jsonb,
    created_at timestamptz default now()
  )`,
];
