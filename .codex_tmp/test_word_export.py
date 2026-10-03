from docx import Document
from pathlib import Path
p=Path(__file__).resolve().parent/'tiny.docx'
d=Document(); d.add_paragraph('test'); d.save(p); print(p)
