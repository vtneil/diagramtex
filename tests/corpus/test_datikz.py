"""Offline checks for corpus extraction and deterministic selection."""
import importlib.util
import pathlib
import unittest
import tempfile
import subprocess
import sys
import json
sys.dont_write_bytecode=True

spec=importlib.util.spec_from_file_location('datikz',pathlib.Path(__file__).parents[2]/'scripts/datikz-corpus.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CorpusTests(unittest.TestCase):
    def test_comments_and_nested_options(self):
        data=m.constructs(r'''% \foreach fake
\usetikzlibrary{calc,positioning}
\tikzset{box/.style={draw=red,minimum size=5mm}}
\node[box,fill={red!25},label={[text=blue]above:Text}] {A\%};''')
        self.assertNotIn('foreach',data['commands'])
        self.assertEqual(data['libraries']['positioning'],1)
        for key in ['box/.style','draw','minimum size','fill','label','text']:
            self.assertIn(key,data['option_keys'])
    def test_tex_comments_respect_backslash_pairs(self):
        self.assertEqual(m.uncomment('x\\% y% gone\nz'), 'x\\% y\nz')
        self.assertEqual(m.uncomment('x\\\\%gone'), 'x\\\\')
    def test_selection_is_deterministic_and_diverse(self):
        rows=[{'sha256':str(i),'tags':['common']+(['rare'] if i==9 else [])} for i in range(10)]
        first=m.select_cases(rows,4,7)
        self.assertEqual(first,m.select_cases(list(reversed(rows)),4,7))
        self.assertEqual(len(first),4)
        self.assertIn('rare',set().union(*(set(r['tags']) for r in first)))
    def test_offline_jsonl_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            source=root/'rows.jsonl'
            source.write_text('\n'.join(json.dumps(row) for row in [
                {'code':r'\\draw (0,0)--(1,1);','origin':'local','image':None},
                {'code':r'\\draw (0,0)--(1,1);','origin':'duplicate'},
                {'code':r'\\fill (0,0) circle(1pt);','origin':'local'}]))
            output=root/'out'
            subprocess.run([sys.executable,str(pathlib.Path(m.__file__)),'--backend','jsonl','--input',str(source),
                '--out',str(output),'--max-rows','3','--samples','2'],check=True,capture_output=True)
            report=json.loads((output/'manifest.json').read_text())
            self.assertEqual(report['duplicate_code_rows'],1)
            self.assertEqual(len(report['cases']),2)
            self.assertTrue(all((output/case['code_path']).is_file() for case in report['cases']))
    def test_pics_loops_and_opacity_are_discovered(self):
        features=m.constructs(r'\foreach \i in {1,2} \path[fill opacity=1/50] (0,0) pic {disc};')['features']
        for key in ['pics','loops','transparency']:self.assertIn(key,features)

if __name__=='__main__':unittest.main()
