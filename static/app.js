(() => {
  'use strict';

  const CONFIG = {
    descuentoFijo: 499000,
    tarifasIca: {
      t1: 0.00766,
      t2: 0.00966,
      t3: 0.00414
    },
    camposObligatorios: [
      'g13', 'g14', 'g15', 'g16', // N° Pago, Planilla, Mes, Año
      'd15', 'd16', 'd17', 'd18', 'd19' // Liq., Tipo, Concepto, CeCo, ICA
    ],
    camposEditables: [
      'c14', 'g13', 'g14', 'g15', 'g16',
      'd15', 'd16', 'd17', 'd18', 'd19',
      'c27', 'c28', 'g27', 'g28'
    ],
    tiposContratoRojo: ['ODC', 'OSU', 'OUF', 'ODO', 'OEF', 'OCO', 'OFC', 'OCA', 'OOF', 'OFO'],
    tiposContratoEstampilla: ['OCO', 'OFO']
  };

  let modoC14 = 'NUMERO';

  const $ = (id) => document.getElementById(id);

  // --- Formateo y utilidades numéricas ---
  function parsearNumero(str) {
    if (!str) return 0;
    const limpio = String(str).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return parseFloat(limpio) || 0;
  }

  function formatearCOP(num, dec = 0) {
    return num.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function formatearInputMiles(inputEl) {
    const soloDigitos = inputEl.value.replace(/\D/g, '');
    inputEl.value = soloDigitos ? parseInt(soloDigitos, 10).toLocaleString('es-CO') : '';
    recalcularTodo();
  }

  // --- Gestión de Tema Visual ---
  function inicializarTema() {
    if (localStorage.getItem('temaCentralPagos') === 'dark') {
      document.body.classList.add('dark-mode');
      $('btnTheme').innerText = '☀️ Papel Suave';
    }
  }

  function alternarTema() {
    const esOscuro = document.body.classList.toggle('dark-mode');
    localStorage.setItem('temaCentralPagos', esOscuro ? 'dark' : 'paper');
    $('btnTheme').innerText = esOscuro ? '☀️ Papel Suave' : '🌙 Modo Noche';
  }

  // --- Gestión de Estado (BOT / MANUAL / SINBOT) ---
  function actualizarModoEstado() {
    const estado = $('b21').value;
    const lbl = $('lblB9');
    const inp = $('b9');

    CONFIG.camposEditables.forEach((id) => {
      $(id).disabled = false;
    });

    if (estado === 'MANUAL') {
      inp.value = '';
      inp.disabled = true;
      lbl.innerText = 'Entrada Automática (Desactivada en modo MANUAL)';
      inp.placeholder = 'Desactivado en modo MANUAL — Ingresa cada valor abajo';
      $('g13').focus();
    } else if (estado === 'SINBOT') {
      inp.disabled = false;
      lbl.innerText = 'Trama SINBOT (Estructura APROBADO||PAGO...)';
      inp.placeholder = 'Pega aquí: APROBADO||PAGO 9 PL 96794424 OCT 2026||91||K||KS8||2111503||74902||4500000';
    } else {
      inp.disabled = false;
      lbl.innerText = 'Fórmula de Liquidación (Web Central de Pagos)';
      inp.placeholder = 'Pega aquí: FORMULA DE LIQUIDACIÓN: 91 - SIN IVA ... , TIPO: K ...';
    }
  }

  // --- Validación Visual de Contrato ---
  function actualizarVistaContrato(contratoRaw) {
    const contrato = String(contratoRaw || '').trim();
    const contratoEl = $('metaContrato');
    const estampillaEl = $('metaEstampilla');

    contratoEl.innerText = contrato || 'N/A';

    const upper = contrato.toUpperCase();
    const esRojo = CONFIG.tiposContratoRojo.some((sigla) => upper.includes(sigla));
    const tieneEstampilla = CONFIG.tiposContratoEstampilla.some((sigla) => upper.includes(sigla));

    contratoEl.classList.toggle('contrato-alerta', esRojo);
    estampillaEl.style.display = tieneEstampilla ? 'inline-block' : 'none';
  }

  // --- Parseo de Entrada Principal (BOT o SINBOT) ---
  function parsearB9() {
    const estado = $('b21').value;
    if (estado === 'MANUAL') return;

    const raw = $('b9').value.trim();

    if (estado === 'SINBOT' || raw.includes('||')) {
      const partes = raw.split('||').map((p) => p.trim());
      if (partes.length >= 2) {
        const lineaPago = partes[1] || '';
        $('c14').value = lineaPago;

        const mPago = lineaPago.match(/^PAGO\s+(FINAL|\d+)\s+PL\s+([A-Z0-9-]+)\s+([A-ZÁÉÍÓÚÑ]+)\s+(\d{4})/i);
        if (mPago) {
          if (mPago[1].toUpperCase() === 'FINAL') {
            modoC14 = 'FINAL';
            $('btnModoNum').classList.remove('active');
            $('btnModoFin').classList.add('active');
            $('g13').value = 'FINAL';
          } else {
            modoC14 = 'NUMERO';
            $('btnModoNum').classList.add('active');
            $('btnModoFin').classList.remove('active');
            $('g13').value = mPago[1];
          }
          $('g14').value = mPago[2];
          $('g15').value = mPago[3].toUpperCase();
          $('g16').value = mPago[4];
        }

        if (partes[2] !== undefined) $('d15').value = partes[2];
        if (partes[3] !== undefined) $('d16').value = partes[3];
        if (partes[4] !== undefined) $('d17').value = partes[4];
        if (partes[5] !== undefined) {
          $('d18').value = partes[5];
          consultarCeco(partes[5]);
        }
        if (partes[6] !== undefined) $('d19').value = partes[6];
        if (partes[7] !== undefined && partes[7] !== '') {
          const valNum = parsearNumero(partes[7]);
          $('c27').value = formatearCOP(valNum, 0);
        }

        recalcularTodo();
        return;
      }
    }

    const txt = raw.toUpperCase();
    const mLiq  = txt.match(/FORMULA\s+DE\s+LIQUIDACI[ÓO]N:\s*([A-Z0-9]+)/);
    const mTipo = txt.match(/TIPO:\s*([A-Z0-9]+)/);
    const mConc = txt.match(/CONCEPTO\s+LIQUIDACI[ÓO]N:\s*([A-Z0-9]+)/);
    const mCeco = txt.match(/CENTRO\s+DE\s+COSTO:\s*([A-Z0-9]+)/);
    const mIca  = txt.match(/,\s*ICA:\s*([A-Z0-9]+)/) || txt.match(/\bICA:\s*([A-Z0-9]+)/);

    if (mLiq)  $('d15').value = mLiq[1];
    if (mTipo) $('d16').value = mTipo[1];
    if (mConc) $('d17').value = mConc[1];
    if (mCeco) {
      $('d18').value = mCeco[1];
      consultarCeco(mCeco[1]);
    }
    if (mIca)  $('d19').value = mIca[1];

    recalcularTodo();
  }

  // --- Consultas al Backend Flask ---
  async function consultarCeco(codigo) {
    const cecoLimpio = String(codigo || '').trim();
    const box = $('cecoBox');
    const descEl = $('cecoDesc');
    const actEl = $('cecoAct');

    if (!cecoLimpio) {
      box.style.display = 'none';
      return;
    }

    try {
      const resp = await fetch(`/buscar_ceco/${encodeURIComponent(cecoLimpio)}`);
      const data = await resp.json();
      if (data.encontrado && (data.descripcion || data.actividad)) {
        descEl.innerText = data.descripcion || '';
        actEl.innerText = data.actividad || '';
        box.style.display = 'flex';
      } else {
        descEl.innerText = 'CeCo no encontrado en hoja ceco';
        actEl.innerText = '';
        box.style.display = 'flex';
      }
    } catch {
      box.style.display = 'none';
    }
  }

  async function ejecutarProceso() {
    const estado = $('b21').value;
    if (estado !== 'MANUAL') {
      parsearB9();
    }

    const rawB9 = $('b9').value.trim();
    const caseId = $('f11').value.trim();
    const status = $('dbStatus');

    if ((estado === 'SINBOT' || rawB9.includes('||')) && !caseId) {
      status.className = 'status-pill status-ok';
      status.innerText = '✅ Trama SINBOT cargada y validada';
      validarCamposObligatorios(true); // <-- 1. Aquí (si falta algún campo en SINBOT)
      return;
    }

    if (!caseId) {
      if (estado === 'MANUAL') {
        recalcularTodo();
        status.className = 'status-pill status-ok';
        status.innerText = '✅ Modo MANUAL actualizado';
        validarCamposObligatorios(true); // <-- 2. Aquí (si falta algún campo en MANUAL)
        return;
      }
      status.className = 'status-pill status-err';
      status.innerText = '⚠️ Ingresa un número de CASE (ID de Carga)';
      $('f11').focus();
      return;
    }

    status.className = 'status-pill';
    status.innerText = `⏳ Consultando CASE ${caseId}...`;

    try {
      const resp = await fetch(`/buscar_case/${encodeURIComponent(caseId)}`);
      const data = await resp.json();

      if (data.error) {
        status.className = 'status-pill status-err';
        status.innerText = `⚠️ ${data.error}`;
        return;
      }

      if (data.encontrado) {
        status.className = 'status-pill status-ok';
        status.innerText = `✅ CASE ${caseId} cargado correctamente`;

        $('metaSolicitante').innerText = data.solicitante || 'N/A';
        actualizarVistaContrato(data.contrato);
        $('metaArchivo').innerText = data.archivo || '';
        $('metaBanner').style.display = 'flex';

        if (!rawB9.includes('||')) {
          $('g13').value = data.pago;
          $('g14').value = data.pl;
          $('g15').value = data.mes;
          $('g16').value = data.anio;

          const rawVal = String(data.valor || '0').trim();
          let valorNum = 0;
          if (rawVal.includes(',') && rawVal.includes('.')) {
            valorNum = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
          } else if (rawVal.includes(',')) {
            valorNum = parseFloat(rawVal.replace(',', '.'));
          } else {
            valorNum = parseFloat(rawVal);
          }
          valorNum = isNaN(valorNum) ? 0 : valorNum;

          $('c27').value = formatearCOP(valorNum, 0);
          actualizarLineasPago();
        }

        recalcularTodo();
        validarCamposObligatorios(true); // <-- 3. Aquí (solo cuando data.encontrado es true)
      } else {
        status.className = 'status-pill status-err';
        status.innerText = `❌ CASE ${caseId} no encontrado en el Excel`;
        $('metaBanner').style.display = 'none';
      }
    } catch {
      status.className = 'status-pill status-err';
      status.innerText = '⚠️ Sin conexión con app.py (Verifica que esté corriendo en VSC)';
    }
  }

  // --- Cálculos y Construcción de Trama ---
  function setModo(opcion) {
    modoC14 = opcion;
    $('btnModoNum').classList.toggle('active', opcion === 'NUMERO');
    $('btnModoFin').classList.toggle('active', opcion === 'FINAL');
    actualizarLineasPago();
    recalcularTodo();
  }

  function actualizarLineasPago() {
    const pago = $('g13').value.trim();
    const pl = $('g14').value.trim();
    const mesRaw = $('g15').value.trim();
    const anio = $('g16').value.trim();

    if (!pago && !pl) return;

    const mesAbrev = mesRaw
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .slice(0, 3);

    const prefijo = (modoC14 === 'FINAL') ? 'PAGO FINAL' : `PAGO ${pago}`;
    $('c14').value = `${prefijo} PL ${pl} ${mesAbrev} ${anio}`.replace(/\s+/g, ' ').trim();
  }
  function validarCamposObligatorios(mostrarAlerta = false) {
    let faltantes = [];

    CONFIG.camposObligatorios.forEach((id) => {
      const el = $(id);
      if (!el) return;

      const estaVacio = el.value.trim() === '';
      el.classList.toggle('input-vacio-alerta', estaVacio);

      if (estaVacio) {
        const label = document.querySelector(`label[for="${id}"]`);
        faltantes.push({ id, nombre: label ? label.innerText : id });
      }
    });

    if (mostrarAlerta && faltantes.length > 0) {
      const status = $('dbStatus');
      const nombres = faltantes.map((f) => f.nombre).join(', ');
      status.className = 'status-pill status-err';
      status.innerText = `⚠️ Faltan campos obligatorios: ${nombres}`;
      $(faltantes[0].id).focus();
      return false;
    }

    return faltantes.length === 0;
  }

  function aplicarTotalSS() {
    const salud = parsearNumero($('g27').value);
    const pension = parsearNumero($('g28').value);
    const totalSS = Math.round(salud + pension);

    $('c28').value = totalSS > 0 ? formatearCOP(totalSS, 0) : '';
    recalcularTodo();
  }

  function recalcularTodo() {
    const g27 = parsearNumero($('g27').value);
    const g28 = parsearNumero($('g28').value);
    $('g29').innerText = formatearCOP(g27 + g28);

    const sol = parsearNumero($('c27').value);
    const desc = parsearNumero($('c28').value);
    const neto = Math.round(sol - desc);

    $('c20').innerText = `$ ${formatearCOP(neto)}`;
    $('d20').innerText = neto;

    $('c33').innerText = formatearCOP(Math.round(neto * CONFIG.tarifasIca.t1));
    $('c34').innerText = formatearCOP(Math.round(neto * CONFIG.tarifasIca.t2));
    $('c35').innerText = formatearCOP(Math.round(neto * CONFIG.tarifasIca.t3));

    const c14 = $('c14').value.trim();
    const d15 = $('d15').value.trim();
    const d16 = $('d16').value.trim();
    const d17 = $('d17').value.trim();
    const d18 = $('d18').value.trim();
    const d19 = $('d19').value.trim();
    const valStr = neto > 0 ? neto : '';

    $('c23').innerText = ['APROBADO', c14, d15, d16, d17, d18, d19, valStr].join('||');     
    validarCamposObligatorios(false);   
  }

  function copiarGenerada() {
    if (!validarCamposObligatorios(true)) return; 
    const trama = $('c23').innerText;
    navigator.clipboard.writeText(trama);
    const btn = $('btnCopy');
    btn.innerText = '✅ ¡Copiado!';
    setTimeout(() => {
      btn.innerText = '📋 Copiar';
    }, 1500);
  }

  function borrarTodo() {
    document.querySelectorAll('input').forEach((i) => {
      i.value = '';
    });
    $('b21').value = 'BOT';
    actualizarModoEstado();
    $('metaContrato').classList.remove('contrato-alerta');
    $('metaEstampilla').style.display = 'none';
    $('cecoBox').style.display = 'none';
    $('metaBanner').style.display = 'none';
    $('dbStatus').className = 'status-pill';
    $('dbStatus').innerText = 'Listo • Ruta: Documentos/centralpagos';
    setModo('NUMERO');
    recalcularTodo();
    $('b9').focus();  
  }
    
    // --- Registro de Eventos ---
  function registrarEventos() {
    $('btnTheme').addEventListener('click', alternarTema);
    $('btnExec').addEventListener('click', ejecutarProceso);
    $('btnModoNum').addEventListener('click', () => setModo('NUMERO'));
    $('btnModoFin').addEventListener('click', () => setModo('FINAL'));
    $('btnCopy').addEventListener('click', copiarGenerada);
    $('btnClear').addEventListener('click', borrarTodo);
    
    $('btnPreset499').addEventListener('click', () => {
      $('c28').value = formatearCOP(CONFIG.descuentoFijo, 0);
      recalcularTodo();
    });

    ['f11', 'b9'].forEach((id) => {
      $(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          ejecutarProceso();
        }
      });
    });

    $('b21').addEventListener('change', () => {
      actualizarModoEstado();
      if ($('b21').value !== 'MANUAL' && $('b9').value.trim()) {
        parsearB9();
      }
      recalcularTodo();
    });

    $('b9').addEventListener('input', parsearB9);

    ['c27', 'c28'].forEach((id) => {
      $(id).addEventListener('input', function () {
        formatearInputMiles(this);
      });
    });

    ['g27', 'g28'].forEach((id) => {
      $(id).addEventListener('input', function () {
        formatearInputMiles(this);
        aplicarTotalSS();
      });
    });

    // Botón manual para aplicar o reaplicar Total SS a Descuentos
    $('btnAplicarSS').addEventListener('click', aplicarTotalSS);

    ['g13', 'g14', 'g15', 'g16'].forEach((id) => {
      $(id).addEventListener('input', () => {
        actualizarLineasPago();
        recalcularTodo();
      });
    });

    ['c14', 'd15', 'd16', 'd17', 'd18', 'd19'].forEach((id) => {
      $(id).addEventListener('input', recalcularTodo);
    });

    $('d18').addEventListener('input', function () {
      consultarCeco(this.value);
    });
  }

  // --- Inicialización ---
  document.addEventListener('DOMContentLoaded', () => {
    inicializarTema();
    registrarEventos();
    recalcularTodo();
  });
})();