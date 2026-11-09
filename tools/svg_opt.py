"""Simplify amcharts SVG maps: round coordinates, drop sub-pixel relative segments,
strip XML noise. Output: a clean <svg viewBox> with <path id title d> only.
Usage: python3 -I svg_opt.py in.svg out.svg precision min_seg
"""
import re, sys

src, dst, prec, min_seg = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
txt = open(src, encoding='utf-8-sig').read()

meta = re.search(r'<amcharts:ammap[^>]*>', txt).group(0)
bounds = {k: float(v) for k, v in re.findall(r'(\w+)="([-\d.]+)"', meta)}

tok = re.compile(r'([MLHVZmlhvz])|(-?\d*\.?\d+)')

def fmt(n):
    s = f'{n:.{prec}f}'
    s = s.rstrip('0').rstrip('.') if '.' in s else s
    return s if s not in ('-0', '') else '0'

def simplify(d):
    out = []
    cmd = None
    nums = []
    acc = [0.0, 0.0]  # pending relative accumulation
    i = 0
    toks = tok.findall(d)
    items = []
    for c, n in toks:
        if c:
            items.append(('c', c))
        else:
            items.append(('n', float(n)))
    idx = 0
    def flush_acc():
        nonlocal acc
        if acc[0] != 0 or acc[1] != 0:
            out.append('l' + fmt(acc[0]) + ',' + fmt(acc[1]))
        acc = [0.0, 0.0]
    while idx < len(items):
        kind, val = items[idx]
        if kind == 'c':
            cmd = val
            idx += 1
            if cmd in 'Zz':
                flush_acc()
                out.append('z')
            continue
        # numbers under current cmd
        if cmd in 'ML':
            x, y = val, items[idx + 1][1]
            idx += 2
            flush_acc()
            out.append(cmd + fmt(x) + ',' + fmt(y))
        elif cmd == 'l':
            x, y = val, items[idx + 1][1]
            idx += 2
            acc[0] += x; acc[1] += y
            if abs(acc[0]) >= min_seg or abs(acc[1]) >= min_seg:
                flush_acc()
        elif cmd == 'h':
            acc[0] += val; idx += 1
            if abs(acc[0]) >= min_seg: flush_acc()
        elif cmd == 'v':
            acc[1] += val; idx += 1
            if abs(acc[1]) >= min_seg: flush_acc()
        elif cmd == 'H':
            flush_acc(); out.append('H' + fmt(val)); idx += 1
        elif cmd == 'V':
            flush_acc(); out.append('V' + fmt(val)); idx += 1
        else:
            idx += 1
    flush_acc()
    return ''.join(out)

paths = re.findall(r'<path\s+([^>]*?)/?>', txt)
res = []
minx = miny = 1e9; maxx = maxy = -1e9
num = re.compile(r'[ML](-?[\d.]+),(-?[\d.]+)')
for attrs in paths:
    pid = re.search(r'id="([^"]*)"', attrs)
    title = re.search(r'title="([^"]*)"', attrs)
    d = re.search(r'(?<![\w-])d="([^"]*)"', attrs)
    if not (pid and d):
        continue
    nd = simplify(d.group(1))
    # bounding box from absolute coords + cumulative relative
    x = y = 0.0
    for m in re.finditer(r'([MLl])(-?[\d.]+),(-?[\d.]+)', nd):
        c, a, b = m.group(1), float(m.group(2)), float(m.group(3))
        if c == 'l': x += a; y += b
        else: x, y = a, b
        minx, miny, maxx, maxy = min(minx, x), min(miny, y), max(maxx, x), max(maxy, y)
    t = f' title="{title.group(1)}"' if title else ''
    res.append(f'<path id="{pid.group(1)}"{t} d="{nd}"/>')

# amcharts maps are drawn in a 0..W x 0..H box; use the original viewBox if present
vb = re.search(r'viewBox="([^"]*)"', txt)
W = round(maxx + 0.5, 1); H = round(maxy + 0.5, 1)
view = vb.group(1) if vb else f'0 0 {W} {H}'
header = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" '
          f'data-left="{bounds["leftLongitude"]}" data-top="{bounds["topLatitude"]}" '
          f'data-right="{bounds["rightLongitude"]}" data-bottom="{bounds["bottomLatitude"]}">\n')
open(dst, 'w', encoding='utf-8').write(header + '\n'.join(res) + '\n</svg>\n')
print(dst, len(res), 'paths', 'bbox', round(minx,2), round(miny,2), round(maxx,2), round(maxy,2), 'view', view)
