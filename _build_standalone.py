import json, re, os

files = ['countries','ecological_footprint','hdi','gdp','co2','methane','gdi','gii',
         'mpi','material_footprint','lu4','neet','wage','productivity',
         'hale','uhc_coverage','poverty_rate']

data = {}
for f in files:
    with open(f'data/{f}.json', 'r', encoding='utf-8') as fh:
        data[f] = json.load(fh)

with open('lib/echarts.min.js', 'r', encoding='utf-8') as fh:
    echarts = fh.read()

with open('index.html', 'r', encoding='utf-8') as fh:
    html = fh.read()

# Inline echarts
html, n1 = re.subn(
    r'<script[^>]*src=["\']lib/echarts\.min\.js["\'][^>]*></script>',
    lambda m: '<script>' + echarts + '</script>',
    html
)
print('echarts replacements:', n1)

# Replace loadAll body to use window.__DATA__
old = re.search(
    r'(  async function loadAll\(\) \{)[\s\S]*?(\n  \})',
    html
)
print('loadAll found:', bool(old))
new_body = '  async function loadAll() {\n    Object.assign(Cache, window.__DATA__);\n  }'
html = html[:old.start()] + new_body + html[old.end():]

# Inject data before </head>
inline = '<script>window.__DATA__ = ' + json.dumps(data) + ';</script>\n'
html = html.replace('</head>', inline + '</head>', 1)

out = 'index_standalone.html'
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(html)
print('wrote', out, 'size MB:', round(os.path.getsize(out)/1024/1024, 2))
