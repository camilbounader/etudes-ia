# Études IA

Outil personnel pour le master : import du corpus, citations Harvard à la page près, recherche dans tout le corpus.

## Étape 1 — ce qui fonctionne

- Arborescence cours > modules > chapitres (création à la main ; l'import Canvas viendra à l'étape 3).
- Import de PDF dans un chapitre : lecture du texte dans le navigateur, détection des numéros de page imprimés, référence Harvard proposée automatiquement (modifiable).
- Recherche par le sens dans un chapitre, un module, un cours ou tout le master, avec citation `(Auteur, année, p. X)` qui ouvre le PDF à la bonne page.

## Variables d'environnement (Vercel > Settings > Environment Variables)

| Nom | Valeur |
| --- | --- |
| `DATABASE_URL` | Chaîne de connexion Neon (`postgresql://...`) |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `GEMINI_API_KEY` | Clé API Google AI Studio |
| `APP_PASSWORD` | Mot de passe de ton choix pour te connecter à l'application |
| `BLOB_READ_WRITE_TOKEN` | Ajoutée automatiquement quand tu relies un store Blob au projet |

Facultatif : `CLAUDE_MODEL_FAST`, `CLAUDE_MODEL_MAIN`, `CLAUDE_MODEL_BEST`, `GEMINI_EMBED_MODEL` pour changer de modèle sans toucher au code.

## Premier démarrage

1. Ouvre l'application, connecte-toi avec `APP_PASSWORD`.
2. Clique « Initialiser la base ».
3. Crée le cours, le module et le chapitre, puis importe les PDF dans le chapitre.
