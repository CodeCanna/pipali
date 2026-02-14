-- Strip default paths from sandbox_settings so DB only stores user-added paths.
-- Defaults are now merged at load time from code, making them easy to update
-- without DB migrations.

-- Helper: remove elements from a JSONB array that appear in another JSONB array
CREATE OR REPLACE FUNCTION _strip_jsonb_array(arr jsonb, defaults jsonb) RETURNS jsonb AS $$
    SELECT COALESCE(
        jsonb_agg(elem),
        '[]'::jsonb
    )
    FROM jsonb_array_elements(arr) AS elem
    WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(defaults) AS d WHERE d = elem
    );
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint

-- All known default paths across all categories (current + historical)
-- so stale defaults from older versions also get cleaned up.
UPDATE sandbox_settings SET
    allowed_write_paths = _strip_jsonb_array(
        allowed_write_paths,
        '["/tmp", "/private/tmp", "~/.pipali", "/tmp/pipali"]'::jsonb
    ),
    denied_write_paths = _strip_jsonb_array(
        denied_write_paths,
        '["~/.ssh", "~/.gnupg", "~/.gpg", "~/.aws", "~/.azure", "~/.gcloud", "~/.config/gcloud", "~/.docker/config.json", "~/.local/share/keyrings", "**/.ssh", "**/.gnupg", "**/.gpg", "**/.aws", "**/.azure", "**/.gcloud", "**/.password-store", ".npmrc", ".yarnrc", ".pypirc", ".netrc", ".bash_history", ".zsh_history", ".history", ".env", "/etc", "/var/log", "/private/etc", "/private/var"]'::jsonb
    ),
    denied_read_paths = _strip_jsonb_array(
        denied_read_paths,
        '["**/.ssh", "**/.gnupg", "**/.gpg", "~/.ssh", "~/.gnupg", "~/.gpg", "**/.aws", "**/.azure", "**/.gcloud", "~/.aws", "~/.azure", "~/.gcloud", "~/.config/gcloud", ".npmrc", ".yarnrc", ".pypirc", ".netrc", "~/.docker/config.json", "**/.password-store", "~/.local/share/keyrings", ".bash_history", ".zsh_history", ".history", ".env", "/etc", "/var/log", "/private/etc", "/private/var"]'::jsonb
    ),
    allowed_domains = _strip_jsonb_array(
        allowed_domains,
        '["npmjs.org", "*.npmjs.org", "registry.npmjs.org", "pypi.org", "*.pypi.org", "files.pythonhosted.org", "rubygems.org", "crates.io", "github.com", "*.github.com", "api.github.com", "raw.githubusercontent.com", "*.githubusercontent.com", "api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com", "localhost"]'::jsonb
    );
--> statement-breakpoint

-- Also strip platform temp dirs that may have been stored (macOS /var/folders/...)
UPDATE sandbox_settings SET
    allowed_write_paths = _strip_jsonb_array(
        allowed_write_paths,
        (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(allowed_write_paths) AS elem
            WHERE elem #>> '{}' LIKE '/private/var/folders/%'
               OR elem #>> '{}' LIKE '/var/folders/%'
        )
    );
--> statement-breakpoint

DROP FUNCTION _strip_jsonb_array(jsonb, jsonb);
