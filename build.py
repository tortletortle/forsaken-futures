from pathlib import Path
import json
p=Path(__file__).parent
html=(p/'src/index.html').read_text()
for token,file in [('STYLE','style.css'),('ENGINE','engine.js'),('STORY','story.js'),('AUDIO','audio.js'),('ART','art.js'),('CHRONICLE','chronicle.js'),('CHRONICLE_UI','chronicle-ui.js'),('APP','app.js'),('QUALITY','quality.js'),('LAB','lab.js'),('EVOLUTION','evolution.js'),('EVOLUTION_UI','evolution-ui.js'),('PLAYERS','players.js'),('PLAYERS_UI','players-ui.js'),('MULTI','multi.js'),('MULTI_UI','multi-ui.js'),('ROBUST','robust.js'),('ROBUST_UI','robust-ui.js'),('COEVO','coevo.js'),('COEVO_UI','coevo-ui.js'),('ECOLOGY','ecology.js'),('ECOLOGY_UI','ecology-ui.js'),('MEMORY','memory.js'),('MEMORY_UI','memory-ui.js'),('MODULAR','modular.js'),('MODULAR_UI','modular-ui.js'),('MIGRATION','migration.js'),('MIGRATION_UI','migration-ui.js'),('V14','v14.js'),('V14_UI','v14-ui.js'),('V15','v15.js'),('V15_UI','v15-ui.js'),('V16','v16.js'),('V16_UI','v16-ui.js'),('V17','v17.js'),('V17_UI','v17-ui.js')]:
 html=html.replace(f'/* {token} */',(p/'src'/file).read_text())
html=html.replace('/* LEVELS */','const LEVELS = '+json.dumps(json.loads((p/'reference/levels.json').read_text())+json.loads((p/'reference/expansion.json').read_text()),ensure_ascii=False)+';')
(p/'dist').mkdir(exist_ok=True)
(p/'dist/index.html').write_text(html)
