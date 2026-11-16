import os
import shutil
import tempfile
import unicodedata
import webbrowser
from threading import Timer
from flask import Flask, jsonify, render_template
import pandas as pd

app = Flask(__name__)

CARPETA_BASE = os.path.dirname(os.path.abspath(__file__))

MESES_NUM = {
    "1": "Enero", "01": "Enero", "2": "Febrero", "02": "Febrero",
    "3": "Marzo", "03": "Marzo", "4": "Abril", "04": "Abril",
    "5": "Mayo", "05": "Mayo", "6": "Junio", "06": "Junio",
    "7": "Julio", "07": "Julio", "8": "Agosto", "08": "Agosto",
    "9": "Septiembre", "09": "Septiembre", "10": "Octubre",
    "11": "Noviembre", "12": "Diciembre"
}


def normalizar(texto):
    s = " ".join(str(texto).strip().upper().split())
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def obtener_copia_excel():
    archivos = [
        f for f in os.listdir(CARPETA_BASE)
        if f.lower().endswith((".xlsx", ".xls")) and not f.startswith("~$")
    ]
    if not archivos:
        return None, None
    ruta_excel = os.path.join(CARPETA_BASE, archivos[0])
    tmp_path = os.path.join(tempfile.gettempdir(), "temp_central_pagos.xlsx")
    shutil.copy2(ruta_excel, tmp_path)
    return tmp_path, archivos[0]


@app.route("/")
def inicio():
    return render_template("index.html")


@app.route("/buscar_case/<numero_case>")
def buscar_case(numero_case):
    tmp_path, nombre_archivo = obtener_copia_excel()
    if not tmp_path:
        return jsonify({"encontrado": False, "error": f"No hay Excel en {CARPETA_BASE}"})

    try:
        xl = pd.ExcelFile(tmp_path)
        for hoja in xl.sheet_names:
            df = xl.parse(hoja, dtype=str)
            df.columns = [normalizar(c) for c in df.columns]

            if "ID DE CARGA" in df.columns:
                df["ID DE CARGA"] = df["ID DE CARGA"].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
                fila = df[df["ID DE CARGA"] == str(numero_case).strip()]

                if not fila.empty:
                    r = fila.iloc[0]

                    def obtener(col):
                        if col in df.columns and pd.notna(r[col]):
                            val = str(r[col]).strip()
                            return val[:-2] if val.endswith(".0") else val
                        return ""

                    mes_raw = obtener("MES DE COTIZACION")
                    mes_limpio = MESES_NUM.get(mes_raw, mes_raw)

                    return jsonify({
                        "encontrado": True,
                        "archivo": f"{nombre_archivo} ({hoja})",
                        "pago": obtener("NUMERO DE PAGO"),
                        "pl": obtener("NUMERO DE PLANILLA"),
                        "mes": mes_limpio,
                        "anio": obtener("ANO DE COTIZACION"),
                        "valor": obtener("VALOR TOTAL"),
                        "solicitante": obtener("SOLICITANTE"),
                        "contrato": obtener("NUMERO DE CONTRATO")
                    })

        return jsonify({"encontrado": False, "archivo": nombre_archivo})
    except Exception as e:
        return jsonify({"encontrado": False, "error": str(e)})


@app.route("/buscar_ceco/<codigo_ceco>")
def buscar_ceco(codigo_ceco):
    tmp_path, _ = obtener_copia_excel()
    if not tmp_path:
        return jsonify({"encontrado": False})

    try:
        xl = pd.ExcelFile(tmp_path)
        hoja_ceco = next((h for h in xl.sheet_names if normalizar(h) == "CECO"), None)
        if not hoja_ceco and len(xl.sheet_names) > 1:
            hoja_ceco = xl.sheet_names[1]
        if not hoja_ceco:
            return jsonify({"encontrado": False})

        df = xl.parse(hoja_ceco, dtype=str)
        df.columns = [normalizar(c) for c in df.columns]

        if "CECO" not in df.columns:
            return jsonify({"encontrado": False})

        df["CECO"] = df["CECO"].astype(str).str.strip().str.replace(r'\.0$', '', regex=True)
        fila = df[df["CECO"] == str(codigo_ceco).strip()]

        if fila.empty:
            return jsonify({"encontrado": False})

        r = fila.iloc[0]
        descripcion = ""
        actividad = ""
        otras = []

        for col in df.columns:
            if col == "CECO" or col.startswith("UNNAMED") or pd.isna(r[col]):
                continue
            val = str(r[col]).strip()
            if not val or val.lower() == "nan":
                continue

            if "DESCRIPCION" in col:
                descripcion = val
            elif "ACTIVIDAD" in col:
                actividad = val
            else:
                otras.append(val)

        if not descripcion and otras:
            descripcion = otras.pop(0)
        if not actividad and otras:
            actividad = otras.pop(0)

        return jsonify({
            "encontrado": True,
            "descripcion": descripcion,
            "actividad": actividad
        })
    except Exception as e:
        return jsonify({"encontrado": False, "error": str(e)})


if __name__ == "__main__":
    Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(port=5000, debug=False)