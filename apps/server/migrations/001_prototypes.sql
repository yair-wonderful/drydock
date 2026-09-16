-- Prototypes and their versions.
--
-- Deliberately absent: tenant_id and workspace_id. Drydock is one company's
-- internal tool, not a multi-tenant platform feature, and "everyone can browse
-- everyone's work" is the product rather than a gap in it — a prototype nobody
-- else can find is a sketch nobody learns from. Authorship is recorded so the
-- library can say who made a thing; it is not an access boundary.

CREATE TABLE prototypes (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     text        NOT NULL,
    summary                  text        NOT NULL DEFAULT '',
    author                   text        NOT NULL,

    -- Set after the first version exists, which is why it is nullable for the
    -- width of one transaction and never afterwards.
    active_version_id        uuid,

    -- Remix lineage. Both are set together on fork and are deliberately NOT
    -- foreign keys: deleting an original must neither cascade into the copies
    -- that grew out of it nor be blocked by them. A fork is a new object that
    -- remembers where it came from, not a child of it — and it holds its own
    -- copy of the source, so it stays readable after the original is gone.
    forked_from_prototype_id uuid,
    forked_from_version_id   uuid,

    is_archived              boolean     NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prototype_versions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prototype_id   uuid        NOT NULL REFERENCES prototypes (id) ON DELETE CASCADE,

    -- Per-prototype counter starting at 1, assigned server-side. Callers never
    -- choose it: a prototype's history has to read as v1, v2, v3 with no gaps
    -- and no duplicates, which is what makes "open the one I demoed on Tuesday"
    -- a lookup instead of an archaeology exercise.
    version_number integer     NOT NULL,

    -- The source tree, as a JSON array of {path, contents}. An array rather
    -- than an object so authoring order survives the round trip; an object
    -- would re-sort the file list by key on every read.
    files          jsonb       NOT NULL,
    entry_point    text        NOT NULL,

    -- Denormalised from `files` at write time so the history list can show the
    -- shape of each version without reading any tree. Never trusted from the
    -- request.
    file_count     integer     NOT NULL,
    total_bytes    integer     NOT NULL,

    label          text        NOT NULL DEFAULT '',
    created_by     text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),

    -- The backstop for version allocation. The writer takes a row lock on the
    -- parent and reads MAX(version_number); this constraint is what turns a
    -- failure of that discipline into a rejected insert rather than two
    -- versions silently numbered the same.
    CONSTRAINT prototype_versions_number_unique UNIQUE (prototype_id, version_number)
);

-- The library listing: not archived, newest touched first.
CREATE INDEX prototypes_active_updated_idx ON prototypes (updated_at DESC) WHERE NOT is_archived;

-- "what was this remixed from" / "what came out of this".
CREATE INDEX prototypes_forked_from_idx ON prototypes (forked_from_prototype_id)
    WHERE forked_from_prototype_id IS NOT NULL;

-- The unique (prototype_id, version_number) index already serves every
-- prototype_id-prefixed lookup, so there is no separate index on prototype_id.
