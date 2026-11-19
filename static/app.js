(() => {
  'use strict';

  const CONFIG = {
    descuentoFijo: 499000,
    camposObligatorios: [
      'g13', 'g14', 'g15', 'g16', // N° Pago, Planilla, Mes, Año (Exclusivos de CASE)
      'd15', 'd16', 'd17', 'd18', 'd19' // Liq., Tipo, Concepto, CeCo, ICA
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

  // --- Limpieza y bloqueo de datos exclusivos de CASE ---
  function limpiarDatosCase() {
    ['g13', 'g14', 'g15', 'g16', 'c14'].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    renderizarVistaC14();
  }

  function bloquearCamposCase() {
    ['g13', 'g14', 'g15', 'g16'].forEach((id) => {
      const el = $(id);
      if (el) el.readOnly = true;
    });
  }

  // --- Parseo Dual de b9 (NUNCA llena N° Pago, PL, Mes ni Año) ---
  function parsearB9() {
    const raw = $('b9').value.trim();

    if (raw.includes('||')) {
      const partes = raw.split('||').map((p) => p.trim());
      if (partes.length >= 3) {
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
    parsearB9();

    const caseId = $('f11').value.trim();
    const status = $('dbStatus');

    if (!caseId) {
      limpiarDatosCase();
      recalcularTodo();
      status.className = 'status-pill status-err';
      status.innerText = '⚠️ Ingresa un número de CASE para cargar N° Pago, PL, Mes y Año';
      $('f11').focus();
      return;
    }

    status.className = 'status-pill';
    status.innerText = `⏳ Consultando CASE ${caseId}...`;

    try {
      const resp = await fetch(`/buscar_case/${encodeURIComponent(caseId)}`);
      const data = await resp.json();

      if (data.error) {
        limpiarDatosCase();
        recalcularTodo();
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

        $('g13').value = data.pago || '';
        $('g14').value = data.pl || '';
        $('g15').value = data.mes || '';
        $('g16').value = data.anio || '';

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

        if (valorNum > 0 || !parsearNumero($('c27').value)) {
          $('c27').value = formatearCOP(valorNum, 0);
        }

        actualizarLineasPago();
        recalcularTodo();
        validarCamposObligatorios(true);
      } else {
        limpiarDatosCase();
        recalcularTodo();
        status.className = 'status-pill status-err';
        status.innerText = `❌ CASE ${caseId} no encontrado en el Excel`;
        $('metaBanner').style.display = 'none';
      }
    } catch {
      limpiarDatosCase();
      recalcularTodo();
      status.className = 'status-pill status-err';
      status.innerText = '⚠️ Sin conexión con app.py (Verifica que esté corriendo)';
    }
  }

  // --- Cálculos y Construcción de Trama ---
  function setModo(opcion) {
    modoC14 = opcion;
    $('btnModoNum').classList.toggle('active', opcion === 'NUMERO');
    $('btnModoFin').classList.toggle('active', opcion === 'FINAL');
    $('btnModoUni').classList.toggle('active', opcion === 'UNICO');
    actualizarLineasPago();
    recalcularTodo();
  }

  function actualizarLineasPago() {
    const pago = $('g13').value.trim();
    const pl = $('g14').value.trim();
    const mesRaw = $('g15').value.trim();
    const anio = $('g16').value.trim();

    if (!pago && !pl) {
      $('c14').value = '';
      renderizarVistaC14();
      return;
    }

    const mesAbrev = mesRaw
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .slice(0, 3);

    let prefijo = `PAGO ${pago}`;
    if (modoC14 === 'FINAL') prefijo = 'PAGO FINAL';
    if (modoC14 === 'UNICO') prefijo = 'PAGO UNICO';

    $('c14').value = `${prefijo} PL ${pl} ${mesAbrev} ${anio}`.replace(/\s+/g, ' ').trim();
    renderizarVistaC14();
  }

  function renderizarVistaC14() {
    const visor = $('c14Vista');
    const wrapper = visor ? visor.parentElement : null;
    if (!visor || !wrapper) return;

    const texto = $('c14').value.trim().toUpperCase();
    if (!texto) {
      visor.innerHTML = '';
      wrapper.classList.remove('con-resalte');
      return;
    }

    const match = texto.match(/^PAGO\s+(FINAL|UNICO|\d+)\s+PL\s+([A-Z0-9-]+?)\s+([A-ZÁÉÍÓÚÑ]{3})\s+(\d{4})$/i);

    if (match) {
      const numPago = match[1];
      const plCompleta = match[2];
      const mes = match[3];
      const anio = match[4];

      const plInicio = plCompleta.length > 4 ? plCompleta.slice(0, -4) : '';
      const plUltimos4 = plCompleta.slice(-4);

      visor.innerHTML = `
        <span>PAGO</span>
        <span class="c14-resalte">${numPago}</span>
        <span>PL</span>
        <span>${plInicio}<span class="c14-resalte">${plUltimos4}</span></span>
        <span class="c14-resalte">${mes}</span>
        <span>${anio}</span>
      `;
      wrapper.classList.add('con-resalte');
    } else {
      visor.innerHTML = '';
      wrapper.classList.remove('con-resalte');
    }
  }

  // --- Validaciones de Campos y Reglas de Negocio ---
  function validarReglasCampos(mostrarMensaje = false) {
    let errores = [];

    const elCeco = $('d18');
    if (elCeco) {
      elCeco.value = elCeco.value.replace(/\D/g, '').slice(0, 7);
      const cecoValido = /^\d{7}$/.test(elCeco.value);
      elCeco.classList.toggle('input-vacio-alerta', !cecoValido);
      if (!cecoValido) errores.push({ id: 'd18', msg: 'CeCo debe tener exactamente 7 dígitos' });
    }

    const elConcepto = $('d17');
    if (elConcepto) {
      elConcepto.value = elConcepto.value.replace(/\s/g, '').toUpperCase().slice(0, 3);
      const conceptoValido = elConcepto.value.length === 3;
      elConcepto.classList.toggle('input-vacio-alerta', !conceptoValido);
      if (!conceptoValido) errores.push({ id: 'd17', msg: 'Concepto debe tener exactamente 3 caracteres' });
    }

    const hayCase = $('f11') && $('f11').value.trim() !== '';
    if (!hayCase) {
      ['g13', 'g14', 'g15', 'g16'].forEach((id) => {
        if ($(id)) $(id).value = '';
      });
    }

    ['g13', 'g14', 'g15', 'g16'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const vacio = el.value.trim() === '';
      el.classList.toggle('input-vacio-alerta', vacio);
      if (vacio && !errores.some((e) => e.msg.startsWith('Consulta un CASE'))) {
        errores.push({
          id: 'f11',
          msg: 'Consulta un CASE válido para llenar N° Pago, PL, Mes y Año'
        });
      }
    });

    if (mostrarMensaje && errores.length > 0) {
      const status = $('dbStatus');
      status.className = 'status-pill status-err';
      status.innerText = `⚠️ ${errores[0].msg}`;
      if ($(errores[0].id) && !$(errores[0].id).readOnly) {
        $(errores[0].id).focus();
      } else if ($('f11')) {
        $('f11').focus();
      }
      return false;
    }

    return errores.length === 0;
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
      if (!$(faltantes[0].id).readOnly) {
        $(faltantes[0].id).focus();
      } else if ($('f11')) {
        $('f11').focus();
      }
      return false;
    }

    return validarReglasCampos(mostrarAlerta);
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

    const sol = Math.round(parsearNumero($('c27').value));
    const desc = Math.round(parsearNumero($('c28').value));
    const neto = Math.round(sol - desc);

    $('c20').innerText = `$ ${formatearCOP(neto)}`;
    $('d20').innerText = neto;

    if ($('resSolicitud')) $('resSolicitud').innerText = `$ ${formatearCOP(sol)}`;
    if ($('resDescuento')) $('resDescuento').innerText = desc > 0 ? `- $ ${formatearCOP(desc)}` : '$ 0';
    if ($('resResultado')) $('resResultado').innerText = `$ ${formatearCOP(neto)}`;

    const c14 = $('c14').value.trim().toUpperCase();
    renderizarVistaC14();
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
    $('btnModoUni').addEventListener('click', () => setModo('UNICO'));
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

    $('f11').addEventListener('input', () => {
      if (!$('f11').value.trim()) {
        limpiarDatosCase();
        $('metaBanner').style.display = 'none';
        recalcularTodo();
      }
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
    bloquearCamposCase();
    registrarEventos();
    recalcularTodo();
  });
})();