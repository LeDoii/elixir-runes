"""Choix des étiquettes des runes : une fenêtre qui montre, rune par rune, chaque sens du livre (Chapitre 7)
avec l'étiquette proposée. On coche ce qu'on garde, on corrige l'étiquette si besoin et on en ajoute d'autres.

Lancer :  python tools/choisir_etiquettes.py        (depuis SiteRunes/, ou n'importe où)
Résultat : tools/etiquettes_choisies.json (rechargé au prochain lancement ; « Enregistrer » à tout moment).

Format du résultat :
  { "Fehu": [ { "sens": "Fehu symbolise…", "garde": true, "etiquette": "Abondance", "ajouts": ["Richesse"] }, … ], … }
Les propositions viennent de docs/tags.js (RUNE_TAGS) ; les textes du livre, de docs/data.js.
"""
import json
import re
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "etiquettes_choisies.json"


def load_runes():
    text = (ROOT / "docs" / "data.js").read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    return [(r["name"], r["sens"]) for r in data["runes"]]


def load_proposals():
    text = (ROOT / "docs" / "tags.js").read_text(encoding="utf-8")
    block = text[text.index("const RUNE_TAGS = {"): text.index("};", text.index("const RUNE_TAGS = {"))]
    return {m.group(1): re.findall(r'"([^"]+)"', m.group(2)) for m in re.finditer(r"(\w+): \[([^\]]*)\]", block)}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Étiquettes des runes")
        self.geometry("980x640")
        self.runes = load_runes()
        proposals = load_proposals()
        saved = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
        # état : pour chaque rune, une liste de lignes { garde, etiquette, ajouts } (variables tkinter)
        self.rows = {}
        for name, sens in self.runes:
            old = saved.get(name, [])
            lines = []
            for i, text in enumerate(sens):
                o = old[i] if i < len(old) else {}
                lines.append({
                    "sens": text,
                    "garde": tk.BooleanVar(value=o.get("garde", True)),
                    "etiquette": tk.StringVar(value=o.get("etiquette", proposals.get(name, [""] * len(sens))[i])),
                    "ajouts": tk.StringVar(value=", ".join(o.get("ajouts", []))),
                })
            self.rows[name] = lines

        left = ttk.Frame(self)
        left.pack(side="left", fill="y", padx=6, pady=6)
        self.listbox = tk.Listbox(left, width=14, exportselection=False, font=("Segoe UI", 11))
        for name, _ in self.runes:
            self.listbox.insert("end", name)
        self.listbox.pack(fill="y", expand=True)
        self.listbox.bind("<<ListboxSelect>>", lambda e: self.show())
        ttk.Button(left, text="Enregistrer", command=self.save).pack(fill="x", pady=(6, 0))
        ttk.Button(left, text="Résumé", command=self.summary).pack(fill="x", pady=(4, 0))

        self.panel = ttk.Frame(self)
        self.panel.pack(side="left", fill="both", expand=True, padx=6, pady=6)
        self.listbox.selection_set(0)
        self.show()
        self.protocol("WM_DELETE_WINDOW", self.close)

    def current(self):
        sel = self.listbox.curselection()
        return self.runes[sel[0] if sel else 0][0]

    def show(self):
        for w in self.panel.winfo_children():
            w.destroy()
        name = self.current()
        ttk.Label(self.panel, text=name, font=("Segoe UI", 18, "bold")).pack(anchor="w")
        for i, line in enumerate(self.rows[name], 1):
            box = ttk.LabelFrame(self.panel, text="Sens " + str(i))
            box.pack(fill="x", pady=5)
            ttk.Label(box, text=line["sens"], wraplength=760, justify="left").pack(anchor="w", padx=6, pady=(4, 2))
            row = ttk.Frame(box)
            row.pack(fill="x", padx=6, pady=(0, 6))
            ttk.Checkbutton(row, text="Garder  — étiquette :", variable=line["garde"]).pack(side="left")
            ttk.Entry(row, textvariable=line["etiquette"], width=20).pack(side="left", padx=(4, 14))
            ttk.Label(row, text="Autres étiquettes (virgules) :").pack(side="left")
            ttk.Entry(row, textvariable=line["ajouts"], width=34).pack(side="left", padx=4)

    def data(self):
        out = {}
        for name, lines in self.rows.items():
            out[name] = [{
                "sens": l["sens"],
                "garde": l["garde"].get(),
                "etiquette": l["etiquette"].get().strip(),
                "ajouts": [a.strip() for a in l["ajouts"].get().split(",") if a.strip()],
            } for l in lines]
        return out

    def save(self):
        OUT.write_text(json.dumps(self.data(), ensure_ascii=False, indent=1), encoding="utf-8")
        messagebox.showinfo("Enregistré", str(OUT))

    def summary(self):
        win = tk.Toplevel(self)
        win.title("Résumé")
        txt = tk.Text(win, width=90, height=32, wrap="word")
        txt.pack(fill="both", expand=True)
        for name, lines in self.data().items():
            tags = [l["etiquette"] for l in lines if l["garde"] and l["etiquette"]] + [a for l in lines for a in l["ajouts"]]
            txt.insert("end", name + " : " + (", ".join(tags) or "—") + "\n")
        txt.configure(state="disabled")

    def close(self):
        if messagebox.askyesno("Quitter", "Enregistrer avant de quitter ?"):
            OUT.write_text(json.dumps(self.data(), ensure_ascii=False, indent=1), encoding="utf-8")
        self.destroy()


if __name__ == "__main__":
    try:
        App().mainloop()
    except Exception as e:  # message lisible si le fichier de données manque
        print("Erreur :", e, file=sys.stderr)
        raise
