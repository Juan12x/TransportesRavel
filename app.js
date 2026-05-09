'use strict';

// ── COMERCIALES ───────────────────────────────────────────────────────────────
const COMERCIALES = [
  { cedula: '43274991',   nombre: 'JULY DAHYANA QUINTERO GALLEGO' },
  { cedula: '98627115',   nombre: 'WILMAR VANEGAS ECHAVARRIA' },
  { cedula: '43604830',   nombre: 'PAULA ANDREA BERMUDEZ COLORADO' },
  { cedula: '1040745576', nombre: 'HECTOR ANDRES PINZON BERMUDEZ' },
  { cedula: '1026149279', nombre: 'ANDRES FELIPE VASQUEZ VASQUEZ' },
  { cedula: '1089745980', nombre: 'JUAN ESTEBAN SARRIA VARGAS' },
  { cedula: '1036635455', nombre: 'ALEXIS PEREZ GUTIERREZ' },
  { cedula: '1152453642', nombre: 'DOUGLAS ALONSO SARRAZOLA QUINTERO' },
  { cedula: '1010193012', nombre: 'JULY FERNANDA VILLAMIL SALCEDO' },
  { cedula: '1036647565', nombre: 'FRANCIS ARLEY MEJIA GOMEZ' },
  { cedula: '1017180086', nombre: 'JHON FREDY MONTES TORO' },
  { cedula: '43490704',   nombre: 'MONICA MARIA FRANCO MORALES' },
  { cedula: '91278657',   nombre: 'CHRISTIAN MANUEL OCHOA PINZON' },
  { cedula: '1152207360', nombre: 'ANDREA VERA MOLINA' },
  { cedula: '71316400',   nombre: 'JOSE MAURICIO FERNANDEZ VALENCIA' },
];

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ADMIN_PIN = '1234';

const EMAILJS_PUBLIC_KEY  = 'x9B031X2tsq-uzKaN';
const EMAILJS_SERVICE_ID  = 'TransportesRavel';
const EMAILJS_TEMPLATE_ID = 'template_rmowjnt';

// Correos que reciben la notificación de nuevo servicio
const NOTIFICATION_EMAILS = [
  'juanbaena553@gmail.com',
  'Gerencia@transravel.com',
];

emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const firebaseConfig = {
  apiKey:            'AIzaSyCgUAblhX56Hxp92cUbDYGcp0h55cA4fZQ',
  authDomain:        'transportesravel2026.firebaseapp.com',
  projectId:         'transportesravel2026',
  storageBucket:     'transportesravel2026.firebasestorage.app',
  messagingSenderId: '295541915149',
  appId:             '1:295541915149:web:6e88a172e5b4f455e6df44'
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();

// ── STATE ─────────────────────────────────────────────────────────────────────
let trips          = [];
let clients        = [];
let costCenters    = [];
let conductores    = [];
let bitacoraList   = [];
let rutas          = [];
let btDeleteId     = null;
let currentView    = 'dashboard';
let editingId      = null;
let deleteTargetId = null;
let calendarDate   = new Date();

// ── FIRESTORE SYNC ────────────────────────────────────────────────────────────
db.collection('trips').onSnapshot(snapshot => {
  trips = snapshot.docs.map(d => d.data()).sort((a, b) => a.id - b.id);
  document.getElementById('recordCount').textContent =
    trips.length + ' registro' + (trips.length !== 1 ? 's' : '');
  if (document.body.classList.contains('admin-mode')) {
    if      (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'records')   renderRecords();
    else if (currentView === 'calendar')  renderCalendar();
    else if (currentView === 'bitacora')  renderBitacora();
  }
}, () => showToast('Error al conectar con la base de datos', 'error'));

// Sincronizar colección de clientes
db.collection('clientes').onSnapshot(snapshot => {
  clients = snapshot.docs.map(d => d.data());
});

// Sincronizar colección de centros de costos
db.collection('centrosCostos').onSnapshot(snapshot => {
  costCenters = snapshot.docs.map(d => d.data()).sort((a, b) => a.label.localeCompare(b.label));
});

// Sincronizar colección de conductores
db.collection('conductores').onSnapshot(snapshot => {
  conductores = snapshot.docs.map(d => d.data()).sort((a, b) => (a.conductor || '').localeCompare(b.conductor || ''));
});

// Sincronizar rutas empresariales (plantillas permanentes, sin fecha)
db.collection('rutasEmpresariales').onSnapshot(snapshot => {
  rutas = snapshot.docs
    .map(d => ({ ...d.data(), id: d.id }))
    .sort((a, b) =>
      (a.clientFullName || '').localeCompare(b.clientFullName || '') ||
      (a.departureTime  || '').localeCompare(b.departureTime  || '')
    );
  if (document.body.classList.contains('admin-mode') && currentView === 'bitacora') renderBitacora();
});

function save() {}

function nextId() {
  return trips.reduce((max, t) => t.id > max ? t.id : max, 0) + 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// VISTA CLIENTE
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('cf_supportDocs').addEventListener('change', function () {
  const name = this.files[0] ? this.files[0].name : 'Seleccionar archivo (PDF, imagen, Word)';
  document.getElementById('cf_supportDocsName').textContent = name;
});

document.getElementById('clientForm').addEventListener('submit', async e => {
  e.preventDefault();

  const btn = document.getElementById('cf_submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg> Enviando...';

  const paymentMethodEl  = document.querySelector('input[name="cf_paymentMethod"]:checked');
  const serviceTypeEl    = document.querySelector('input[name="cf_serviceType"]:checked');
  const clientStatusEl   = document.querySelector('input[name="cf_clientStatus"]:checked');
  const clientStatus     = clientStatusEl ? clientStatusEl.value : 'antiguo';
  const fileInput        = document.getElementById('cf_supportDocs');
  const file            = fileInput.files[0];
  const tripId          = nextId();

  let supportDocUrl  = '';
  let supportDocName = '';

  // Resolve client identity from the antiguo/nuevo toggle
  let resolvedNit = '', resolvedFullName = '', newClientData = null;
  if (clientStatus === 'nuevo') {
    const tipo = document.getElementById('cf_newTipo').value;
    resolvedNit = document.getElementById('cf_newIdentificacion').value.trim().replace(/[.\-\s]/g, '');
    if (tipo === 'persona') {
      const nombres   = document.getElementById('cf_newNombres').value.trim();
      const apellidos = document.getElementById('cf_newApellidos').value.trim();
      resolvedFullName = [nombres, apellidos].filter(Boolean).join(' ') ||
                         document.getElementById('cf_newNombreComercialP').value.trim();
    } else {
      resolvedFullName = document.getElementById('cf_newRazonSocial').value.trim() ||
                         document.getElementById('cf_newNombreComercialE').value.trim();
    }
    newClientData = {
      tipo,
      tipoId:    document.getElementById('cf_newIdType').value,
      dv:        document.getElementById('cf_newDv').value.trim(),
      ciudad:    document.getElementById('cf_newCiudad').value.trim(),
      direccion: document.getElementById('cf_newDireccion').value.trim(),
      telefono:  document.getElementById('cf_newTelefono').value.trim(),
    };
  } else {
    resolvedNit      = document.getElementById('cf_clientNit').value.trim();
    resolvedFullName = document.getElementById('cf_clientFullName').value.trim();
  }

  if (file) {
    try {
      const ref = storage.ref(`documentos-soporte/${tripId}/${file.name}`);
      await ref.put(file);
      supportDocUrl  = await ref.getDownloadURL();
      supportDocName = file.name;
    } catch {
      showToast('Error al subir el documento. Intenta de nuevo.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Enviar Solicitud';
      return;
    }
  }

  const trip = {
    id:               tripId,
    submitterEmail:   document.getElementById('cf_submitterEmail')?.value.trim() || '',
    comercial:        document.getElementById('cf_comercial').value,
    serviceType:      serviceTypeEl ? serviceTypeEl.value : '',
    costCenter:       document.getElementById('cf_costCenter').value,
    purchaseOrder:    document.getElementById('cf_purchaseOrder').value.trim() || 'OS-' + String(tripId).padStart(4, '0'),
    clientNit:        resolvedNit,
    clientFullName:   resolvedFullName,
    entryChannel:     document.getElementById('cf_entryChannel').value,
    clientName:       document.getElementById('cf_name').value.trim(),
    clientPhone:      document.getElementById('cf_phone').value.trim(),
    clientEmail:      document.getElementById('cf_clientEmail').value.trim(),
    invoiceDate:      document.getElementById('cf_invoiceDate').value,
    passengers:       document.getElementById('cf_passengers').value,
    serviceStartDate: document.getElementById('cf_startDate').value,
    serviceEndDate:   document.getElementById('cf_endDate').value,
    departureDate:    document.getElementById('cf_startDate').value,
    returnDate:       document.getElementById('cf_endDate').value,
    origin:           document.getElementById('cf_origin').value.trim(),
    destination:      document.getElementById('cf_destination').value.trim(),
    departureTime:    document.getElementById('cf_departureTime').value,
    returnTime:       document.getElementById('cf_returnTime').value,
    observations:     document.getElementById('cf_observations').value.trim(),
    cost:             parsePrecio('cf_serviceValue'),
    transporterValue: parsePrecio('cf_transporterValue'),
    invoiceDetail:    document.getElementById('cf_invoiceDetail').value.trim(),
    paymentMethod:    paymentMethodEl ? paymentMethodEl.value : '',
    dueDate:          document.getElementById('cf_dueDate').value,
    invoiceEmail:     document.getElementById('cf_invoiceEmail').value.trim(),
    supportDocUrl,
    supportDocName,
    driver:           '',
    vehicle:          '',
    clientRut:        '',
    tripType:         '',
    paymentStatus:    'Pendiente',
    tripStatus:       'Pendiente',
    internalNotes:    '',
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };

  db.collection('trips').doc(String(trip.id)).set(trip)
    .then(() => {
      if (newClientData) saveNewClient(trip, newClientData);
      else saveClientIfNew(trip);
      sendNotificationEmail(trip);
      showClientSuccess();
    })
    .catch(() => showToast('Error al enviar la solicitud', 'error'))
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg> Enviar Solicitud';
    });
});

function showClientSuccess() {
  document.getElementById('clientFormCard').style.display   = 'none';
  document.getElementById('clientSuccessCard').style.display = 'flex';
}

function showClientForm() {
  document.getElementById('clientForm').reset();
  document.getElementById('clientFormCard').style.display    = 'block';
  document.getElementById('clientSuccessCard').style.display = 'none';
  document.getElementById('cf_secAntiguo').style.display     = 'none';
  document.getElementById('cf_secNuevo').style.display       = 'none';
  const nextOds = 'OS-' + String(nextId()).padStart(4, '0');
  const odsField = document.getElementById('cf_purchaseOrder');
  if (odsField) odsField.value = nextOds;
}

document.getElementById('newRequestBtn').addEventListener('click', showClientForm);

function sendNotificationEmail(trip) {
  const fmt = v => v || '—';
  const fmtMoney = v => v ? '$' + Number(v).toLocaleString('es-CO') : '—';
  const params = {
    service_id:          String(trip.id),
    created_at:          new Date(trip.createdAt).toLocaleString('es-CO'),
    client_name:         fmt(trip.clientName),
    client_phone:        fmt(trip.clientPhone),
    client_email:        fmt(trip.clientEmail),
    origin:              fmt(trip.origin),
    destination:         fmt(trip.destination),
    start_date:          fmt(trip.serviceStartDate),
    end_date:            fmt(trip.serviceEndDate),
    departure_time:      fmt(trip.departureTime),
    return_time:         fmt(trip.returnTime),
    passengers:          fmt(trip.passengers),
    observations:        fmt(trip.observations),
    invoice_date:        fmt(trip.invoiceDate),
    service_value:       fmtMoney(trip.cost),
    transporter_value:   fmtMoney(trip.transporterValue),
    invoice_detail:      fmt(trip.invoiceDetail),
    payment_method:      fmt(trip.paymentMethod),
    due_date:            fmt(trip.dueDate),
    invoice_email:       fmt(trip.invoiceEmail),
    support_docs:        fmt(trip.supportDocs),
  };
  NOTIFICATION_EMAILS.forEach(to => {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { ...params, to_email: to }).catch(() => {});
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCESO ADMIN — PIN
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('adminAccessBtn').addEventListener('click', () => {
  document.getElementById('pinInput').value   = '';
  document.getElementById('pinError').style.display = 'none';
  document.getElementById('pinOverlay').classList.add('open');
  requestAnimationFrame(() => document.getElementById('pinInput').focus());
});

document.getElementById('pinSubmitBtn').addEventListener('click', checkPin);
document.getElementById('pinInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkPin();
});

function closePinModal() {
  document.getElementById('pinOverlay').classList.remove('open');
}

function checkPin() {
  const entered = document.getElementById('pinInput').value;
  if (entered === ADMIN_PIN) {
    closePinModal();
    enterAdminMode();
  } else {
    document.getElementById('pinError').style.display = 'block';
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  }
}

function enterAdminMode() {
  document.body.classList.add('admin-mode');
  showView('dashboard');
}

document.getElementById('pinClose').addEventListener('click', closePinModal);
document.getElementById('pinCancelBtn').addEventListener('click', closePinModal);

document.getElementById('exitAdminBtn').addEventListener('click', () => {
  document.body.classList.remove('admin-mode');
  showClientForm();
});

// ══════════════════════════════════════════════════════════════════════════════
// NAVEGACIÓN ADMIN
// ══════════════════════════════════════════════════════════════════════════════

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');

  const navLink = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navLink) navLink.classList.add('active');

  const titles = { dashboard: 'Dashboard', records: 'Registros', new: 'Nuevo Viaje', calendar: 'Calendario', bitacora: 'Programación' };
  document.getElementById('topbarTitle').textContent = titles[name] || '';

  currentView = name;
  closeSidebar();

  if (name === 'dashboard') renderDashboard();
  if (name === 'records')   renderRecords();
  if (name === 'calendar')  renderCalendar();
  if (name === 'bitacora') {
    const pgDate = document.getElementById('pgDate');
    if (pgDate && !pgDate.value) pgDate.value = new Date().toISOString().slice(0, 10);
    renderBitacora();
  }
  if (name === 'new' && !editingId) resetForm();
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

function pgChangeDate(delta) {
  const input = document.getElementById('pgDate');
  if (!input) return;
  if (!input.value) input.value = new Date().toISOString().slice(0, 10);
  const d = new Date(input.value + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  input.value = d.toISOString().slice(0, 10);
  renderBitacora();
}

document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showView(link.dataset.view);
  });
});

document.getElementById('topbarNewBtn').addEventListener('click', () => {
  editingId = null;
  resetForm();
  showView('new');
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  const total     = trips.length;
  const completed = trips.filter(t => t.tripStatus === 'Completado').length;
  const pending   = trips.filter(t => ['Pendiente','Confirmado'].includes(t.tripStatus)).length;
  const revenue   = trips.filter(t => t.paymentStatus === 'Pagado').reduce((s, t) => s + Number(t.cost || 0), 0);

  document.getElementById('statTotal').textContent     = total;
  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statPending').textContent   = pending;
  document.getElementById('statRevenue').textContent   = '$' + revenue.toLocaleString('es-CL');
  document.getElementById('recordCount').textContent   = total + ' registro' + (total !== 1 ? 's' : '');

  renderUpcoming();
  renderStatusChart();
}

function renderUpcoming() {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips
    .filter(t => {
      const d = (t.departureDate || t.serviceStartDate || '').slice(0, 10);
      return d >= today && t.tripStatus !== 'Cancelado' && t.tripStatus !== 'Completado';
    })
    .sort((a, b) => {
      const da = (a.departureDate || a.serviceStartDate || '').slice(0, 10);
      const db = (b.departureDate || b.serviceStartDate || '').slice(0, 10);
      return da.localeCompare(db);
    })
    .slice(0, 5);

  const el = document.getElementById('upcomingList');
  if (!upcoming.length) {
    el.innerHTML = '<div class="upcoming-empty">No hay viajes próximos programados.</div>';
    return;
  }

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  el.innerHTML = upcoming.map(t => {
    const d = new Date((t.departureDate || t.serviceStartDate) + 'T12:00:00');
    return `
      <div class="upcoming-item" onclick="openDetail(${t.id})">
        <div class="upcoming-date">
          <span class="day">${d.getDate()}</span>
          <span class="month">${months[d.getMonth()]}</span>
        </div>
        <div class="upcoming-info">
          <div class="upcoming-client">${esc(t.clientName)}</div>
          <div class="upcoming-route">${esc(t.origin)} → ${esc(t.destination)}</div>
        </div>
        <div class="upcoming-cost">$${Number(t.cost||0).toLocaleString('es-CL')}</div>
      </div>`;
  }).join('');
}

function renderStatusChart() {
  const statuses = ['Pendiente','Confirmado','En curso','Completado','Cancelado'];
  const colors   = ['bar-pendiente','bar-confirmado','bar-en-curso','bar-completado','bar-cancelado'];
  const total    = trips.length || 1;

  document.getElementById('statusChart').innerHTML = statuses.map((s, i) => {
    const count = trips.filter(t => t.tripStatus === s).length;
    const pct   = Math.round((count / total) * 100);
    return `
      <div class="chart-bar-item">
        <div class="chart-bar-label"><span>${s}</span><span>${count}</span></div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill ${colors[i]}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// REGISTROS
// ══════════════════════════════════════════════════════════════════════════════

function renderRecords(filtered) {
  const data  = filtered ?? trips;
  const body  = document.getElementById('recordsBody');
  const empty = document.getElementById('tableEmpty');

  if (!data.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = data.map(t => `
    <tr>
      <td><strong>#${t.id}</strong></td>
      <td>
        <div style="font-weight:600">${esc(t.clientName)}</div>
        <div style="font-size:11.5px;color:#64748b">${esc(t.clientRut||'')}</div>
      </td>
      <td>${esc(t.clientPhone||'—')}</td>
      <td>${t.departureDate ? formatDate(t.departureDate) : '—'}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.origin)}</td>
      <td style="max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.destination)}</td>
      <td><strong>$${Number(t.cost||0).toLocaleString('es-CL')}</strong></td>
      <td>${statusBadge(t.tripStatus)}</td>
      <td>${paymentBadge(t.paymentStatus)}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn icon-btn-view" title="Ver detalle" onclick="openDetail(${t.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-btn icon-btn-edit" title="Editar" onclick="editTrip(${t.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn icon-btn-delete" title="Eliminar" onclick="confirmDelete(${t.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function filterRecords() {
  const search  = document.getElementById('searchInput').value.toLowerCase();
  const status  = document.getElementById('filterStatus').value;
  const payment = document.getElementById('filterPayment').value;

  const filtered = trips.filter(t => {
    const matchSearch  = !search || [t.clientName, t.origin, t.destination, t.clientRut, t.clientPhone, t.clientFullName, t.clientNit, String(t.id)]
      .some(v => (v||'').toLowerCase().includes(search));
    const matchStatus  = !status  || t.tripStatus === status;
    const matchPayment = !payment || t.paymentStatus === payment;
    return matchSearch && matchStatus && matchPayment;
  });
  renderRecords(filtered);
}

document.getElementById('searchInput').addEventListener('input', filterRecords);
document.getElementById('filterStatus').addEventListener('change', filterRecords);
document.getElementById('filterPayment').addEventListener('change', filterRecords);

// ══════════════════════════════════════════════════════════════════════════════
// FORMULARIO ADMIN
// ══════════════════════════════════════════════════════════════════════════════

function resetForm() {
  document.getElementById('tripForm').reset();
  document.getElementById('tripId').value = '';
  document.getElementById('formTitle').textContent    = 'Nuevo Viaje';
  document.getElementById('formSubtitle').textContent = 'Completa los datos del servicio';
  document.getElementById('submitBtn').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
    Guardar Viaje`;
}

function fillForm(trip) {
  document.getElementById('tripId').value         = trip.id;
  document.getElementById('clientName').value     = trip.clientName    || '';
  document.getElementById('clientRut').value      = trip.clientRut     || '';
  document.getElementById('clientPhone').value    = trip.clientPhone   || '';
  document.getElementById('clientEmail').value    = trip.clientEmail   || '';
  document.getElementById('tripType').value       = trip.tripType      || '';
  document.getElementById('passengers').value     = trip.passengers    || '';
  document.getElementById('departureDate').value  = trip.departureDate || '';
  document.getElementById('returnDate').value     = trip.returnDate    || '';
  document.getElementById('origin').value         = trip.origin        || '';
  document.getElementById('destination').value    = trip.destination   || '';
  document.getElementById('driver').value         = trip.driver        || '';
  document.getElementById('vehicle').value        = trip.vehicle       || '';
  document.getElementById('cost').value           = trip.cost          || '';
  document.getElementById('paymentStatus').value  = trip.paymentStatus || 'Pendiente';
  document.getElementById('paymentMethod').value  = trip.paymentMethod || '';
  document.getElementById('tripStatus').value     = trip.tripStatus    || 'Pendiente';
  document.getElementById('observations').value   = trip.observations  || '';
  document.getElementById('internalNotes').value  = trip.internalNotes || '';
}

document.getElementById('tripForm').addEventListener('submit', e => {
  e.preventDefault();

  const id = document.getElementById('tripId').value;
  const tripData = {
    id:            id ? Number(id) : nextId(),
    clientName:    document.getElementById('clientName').value.trim(),
    clientRut:     document.getElementById('clientRut').value.trim(),
    clientPhone:   document.getElementById('clientPhone').value.trim(),
    clientEmail:   document.getElementById('clientEmail').value.trim(),
    tripType:      document.getElementById('tripType').value,
    passengers:    document.getElementById('passengers').value,
    departureDate: document.getElementById('departureDate').value,
    returnDate:    document.getElementById('returnDate').value,
    origin:        document.getElementById('origin').value.trim(),
    destination:   document.getElementById('destination').value.trim(),
    driver:        document.getElementById('driver').value.trim(),
    vehicle:       document.getElementById('vehicle').value.trim(),
    cost:          parsePrecio('cost'),
    paymentStatus: document.getElementById('paymentStatus').value,
    paymentMethod: document.getElementById('paymentMethod').value,
    tripStatus:    document.getElementById('tripStatus').value,
    observations:  document.getElementById('observations').value.trim(),
    internalNotes: document.getElementById('internalNotes').value.trim(),
    createdAt:     id ? (trips.find(t => t.id === Number(id))?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };

  db.collection('trips').doc(String(tripData.id)).set(tripData)
    .then(() => showToast(id ? 'Viaje actualizado correctamente' : 'Viaje registrado correctamente', 'success'))
    .catch(() => showToast('Error al guardar el viaje', 'error'));

  editingId = null;
  showView('records');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  editingId = null;
  showView(trips.length ? 'records' : 'dashboard');
});

function editTrip(id) {
  const trip = trips.find(t => t.id === id);
  if (!trip) return;
  editingId = id;
  document.getElementById('formTitle').textContent    = 'Editar Viaje #' + id;
  document.getElementById('formSubtitle').textContent = 'Modifica los datos del servicio';
  document.getElementById('submitBtn').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
    Actualizar Viaje`;
  fillForm(trip);
  showView('new');
  closeModal();
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL DETALLE
// ══════════════════════════════════════════════════════════════════════════════

function openDetail(id) {
  const t = trips.find(t => t.id === id);
  if (!t) return;

  document.getElementById('modalTitle').textContent = `Viaje #${t.id} — ${t.clientName}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-grid">
      <div>
        <div class="detail-section-title">Cliente</div>
        <div class="detail-field"><div class="label">Nombre</div><div class="value">${esc(t.clientName)}</div></div>
        <div class="detail-field"><div class="label">RUT / Documento</div><div class="value">${esc(t.clientRut||'—')}</div></div>
        <div class="detail-field"><div class="label">Teléfono</div><div class="value">${esc(t.clientPhone||'—')}</div></div>
        <div class="detail-field"><div class="label">Email</div><div class="value">${esc(t.clientEmail||'—')}</div></div>
      </div>
      <div>
        <div class="detail-section-title">Viaje</div>
        <div class="detail-field"><div class="label">Tipo</div><div class="value">${esc(t.tripType||'—')}</div></div>
        <div class="detail-field"><div class="label">Pasajeros</div><div class="value">${t.passengers||'—'}</div></div>
        <div class="detail-field"><div class="label">Estado</div><div class="value">${statusBadge(t.tripStatus)}</div></div>
        <div class="detail-field"><div class="label">Conductor / Vehículo</div><div class="value">${esc(t.driver||'—')} / ${esc(t.vehicle||'—')}</div></div>
      </div>
      <div>
        <div class="detail-section-title">Ruta</div>
        <div class="detail-field"><div class="label">Fecha de inicio</div><div class="value">${t.departureDate ? formatDate(t.departureDate) : '—'}</div></div>
        <div class="detail-field"><div class="label">Fecha de regreso</div><div class="value">${t.returnDate ? formatDate(t.returnDate) : '—'}</div></div>
        <div class="detail-field"><div class="label">Origen</div><div class="value">${esc(t.origin)}</div></div>
        <div class="detail-field"><div class="label">Destino</div><div class="value">${esc(t.destination)}</div></div>
      </div>
      <div>
        <div class="detail-section-title">Pago</div>
        <div class="detail-field"><div class="label">Costo</div><div class="value" style="font-size:18px;font-weight:700;color:#166534">$${Number(t.cost||0).toLocaleString('es-CL')}</div></div>
        <div class="detail-field"><div class="label">Estado de pago</div><div class="value">${paymentBadge(t.paymentStatus)}</div></div>
        <div class="detail-field"><div class="label">Forma de pago</div><div class="value">${esc(t.paymentMethod||'—')}</div></div>
        <div class="detail-field"><div class="label">Registrado</div><div class="value" style="font-size:12px;color:#94a3b8">${t.createdAt ? formatDate(t.createdAt) : '—'}</div></div>
      </div>
      ${t.observations ? `<div class="detail-full"><div class="detail-section-title">Observaciones del viaje</div><div class="value" style="background:#f8fafc;padding:12px;border-radius:8px;font-size:13.5px">${esc(t.observations)}</div></div>` : ''}
      ${t.internalNotes ? `<div class="detail-full"><div class="detail-section-title">Notas internas</div><div class="value" style="background:#fefce8;padding:12px;border-radius:8px;font-size:13.5px">${esc(t.internalNotes)}</div></div>` : ''}
    </div>`;

  document.getElementById('modalEdit').onclick   = () => editTrip(id);
  document.getElementById('modalDelete').onclick = () => { closeModal(); confirmDelete(id); };
  document.getElementById('modalPrint').onclick  = () => window.print();

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// ══════════════════════════════════════════════════════════════════════════════
// ELIMINAR
// ══════════════════════════════════════════════════════════════════════════════

function confirmDelete(id) {
  deleteTargetId = id;
  document.getElementById('confirmOverlay').classList.add('open');
}

document.getElementById('confirmCancel').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
  deleteTargetId = null;
});

document.getElementById('confirmDelete').addEventListener('click', () => {
  if (deleteTargetId !== null) {
    db.collection('trips').doc(String(deleteTargetId)).delete()
      .catch(() => showToast('Error al eliminar el registro', 'error'));
    showToast('Registro eliminado', 'info');
    deleteTargetId = null;
  }
  document.getElementById('confirmOverlay').classList.remove('open');
});

// ══════════════════════════════════════════════════════════════════════════════
// CALENDARIO
// ══════════════════════════════════════════════════════════════════════════════

function renderCalendar() {
  const year  = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calMonthTitle').textContent = `${monthNames[month]} ${year}`;

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset      = (firstDay + 6) % 7;

  const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  for (let i = 0; i < offset; i++) html += '<div class="cal-day cal-empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const dayTrips = trips.filter(t => {
      if (!t.departureDate) return false;
      const d = new Date(t.departureDate);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    html += `<div class="cal-day${isToday ? ' cal-today' : ''}">
      <div class="cal-day-num">${day}</div>
      ${dayTrips.map(t => `<div class="cal-event" onclick="openDetail(${t.id})" title="${esc(t.clientName)}: ${esc(t.origin)} → ${esc(t.destination)}">${esc(t.clientName)}</div>`).join('')}
    </div>`;
  }

  document.getElementById('calendarGrid').innerHTML = html;
}

document.getElementById('calPrev').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTAR CSV
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!trips.length) { showToast('No hay registros para exportar', 'error'); return; }

  const headers = ['ID','Cliente','RUT','Teléfono','Email','Tipo Viaje','Pasajeros','Fecha Inicio','Fecha Regreso','Origen','Destino','Conductor','Vehículo','Costo','Estado Pago','Forma Pago','Estado Viaje','Observaciones','Notas Internas','Creado En'];
  const rows = trips.map(t => [
    t.id, t.clientName, t.clientRut, t.clientPhone, t.clientEmail,
    t.tripType, t.passengers,
    t.departureDate ? formatDate(t.departureDate) : '',
    t.returnDate    ? formatDate(t.returnDate)    : '',
    t.origin, t.destination, t.driver, t.vehicle,
    t.cost, t.paymentStatus, t.paymentMethod, t.tripStatus,
    t.observations, t.internalNotes,
    t.createdAt ? formatDate(t.createdAt) : ''
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`));

  const csv  = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `transportesravel_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente', 'success');
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(str) {
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusBadge(status) {
  const map = { 'Pendiente':'badge-pendiente', 'Confirmado':'badge-confirmado', 'En curso':'badge-en-curso', 'Completado':'badge-completado', 'Cancelado':'badge-cancelado' };
  return `<span class="badge ${map[status]||'badge-pendiente'}">${esc(status||'Pendiente')}</span>`;
}

function paymentBadge(status) {
  const map = { 'Pendiente':'badge-pago-pendiente', 'Parcial':'badge-parcial', 'Pagado':'badge-pagado' };
  return `<span class="badge ${map[status]||'badge-pago-pendiente'}">${esc(status||'Pendiente')}</span>`;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Dashboard shortcut links (e.g. "Ver todos" — nav items have their own listeners)
document.querySelectorAll('[data-view]:not(.nav-item)').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    showView(el.dataset.view);
  });
});

// ── FORMATO DE PRECIOS ────────────────────────────────────────────────────────
function parsePrecio(id) {
  return Number((document.getElementById(id).value || '0').replace(/\./g, '')) || 0;
}

['cf_serviceValue', 'cf_transporterValue', 'cost'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const pos   = el.selectionStart;
    const dotsB = (el.value.slice(0, pos).match(/\./g) || []).length;
    const raw   = el.value.replace(/\D/g, '');
    const fmt   = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    el.value    = fmt;
    const dotsA = (fmt.slice(0, pos).match(/\./g) || []).length;
    el.setSelectionRange(pos + (dotsA - dotsB), pos + (dotsA - dotsB));
  });
});

// ── AUTO-CAPITALIZAR NOMBRES Y CIUDADES ───────────────────────────────────────
['cf_name','cf_origin','cf_destination','cf_clientFullName','clientName','origin','destination','driver',
 'cf_newNombres','cf_newApellidos','cf_newNombreComercialP','cf_newRazonSocial','cf_newNombreComercialE','cf_newCiudad'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    const val = el.value.replace(/(?:^|[\s\-\/])\S/g, c => c.toUpperCase());
    if (el.value !== val) {
      el.value = val;
      el.setSelectionRange(pos, pos);
    }
  });
});

// ── AUTOCOMPLETAR CLIENTE ─────────────────────────────────────────────────────
function getUniqueClients() {
  return clients;
}

function saveClientIfNew(trip) {
  if (!trip.clientNit) return;
  const exists = clients.some(c => c.clientNit === trip.clientNit);
  if (!exists) {
    db.collection('clientes').doc(trip.clientNit).set({
      nombre:         trip.clientFullName || trip.clientName,
      tipoId:         'NIT',
      identificacion: trip.clientNit,
      clientNit:      trip.clientNit,
      clientFullName: trip.clientFullName || '',
      clientName:     trip.clientName     || '',
      clientPhone:    trip.clientPhone    || '',
      clientEmail:    trip.clientEmail    || '',
      invoiceEmail:   trip.invoiceEmail   || '',
      costCenter:     trip.costCenter     || '',
      comercial:      trip.comercial      || '',
      createdAt:      new Date().toISOString(),
    });
  }
}

function saveNewClient(trip, data) {
  if (!trip.clientNit) return;
  db.collection('clientes').doc(trip.clientNit).set({
    nombre:         trip.clientFullName,
    tipoId:         data.tipoId,
    identificacion: trip.clientNit,
    dv:             data.dv,
    tipo:           data.tipo,
    clientNit:      trip.clientNit,
    clientFullName: trip.clientFullName,
    clientName:     trip.clientName     || '',
    clientPhone:    trip.clientPhone    || '',
    clientEmail:    trip.clientEmail    || '',
    invoiceEmail:   trip.invoiceEmail   || '',
    costCenter:     trip.costCenter     || '',
    comercial:      trip.comercial      || '',
    ciudad:         data.ciudad,
    direccion:      data.direccion,
    telefono:       data.telefono,
    createdAt:      new Date().toISOString(),
  }, { merge: true });
}

function fillClientFromHistory(c) {
  document.getElementById('cf_clientNit').value      = c.clientNit;
  document.getElementById('cf_clientFullName').value = c.clientFullName;
  document.getElementById('cf_name').value           = c.clientName;
  document.getElementById('cf_phone').value          = c.clientPhone;
  document.getElementById('cf_clientEmail').value    = c.clientEmail;
  document.getElementById('cf_invoiceEmail').value   = c.invoiceEmail;
  const matchCC = costCenters.find(cc => cc.nit && cc.nit === c.clientNit);
  if (matchCC)      document.getElementById('cf_costCenter').value = matchCC.label;
  else if (c.costCenter) document.getElementById('cf_costCenter').value = c.costCenter;
  if (c.comercial)  document.getElementById('cf_comercial').value  = c.comercial;
  document.querySelectorAll('.ac-dropdown').forEach(d => d.style.display = 'none');
  showToast('Datos del cliente cargados', 'success');
}

function setupClientAutocomplete() {
  const configs = [
    { id: 'cf_clientNit',      filter: (c, q) => c.clientNit.toLowerCase().includes(q) },
    { id: 'cf_clientFullName', filter: (c, q) => c.clientFullName.toLowerCase().includes(q) },
  ];

  configs.forEach(({ id, filter }) => {
    const input = document.getElementById(id);
    if (!input) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);

    function showClients(q) {
      dropdown.innerHTML = '';
      const all = getUniqueClients();
      const matches = q ? all.filter(c => filter(c, q)).slice(0, 10) : all.slice(0, 20);
      if (!matches.length) { dropdown.style.display = 'none'; return; }
      matches.forEach(c => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = `<span class="ac-name">${esc(c.clientFullName || c.clientNit)}</span><span class="ac-nit">${esc(c.clientNit)}</span>`;
        item.addEventListener('mousedown', () => fillClientFromHistory(c));
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    }

    input.addEventListener('focus', () => showClients(input.value.toLowerCase().trim()));
    input.addEventListener('input', () => showClients(input.value.toLowerCase().trim()));
    input.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
  });
}

// ── AUTOCOMPLETAR CENTRO DE COSTOS ───────────────────────────────────────────
function setupCostCenterAutocomplete() {
  const input = document.getElementById('cf_costCenter');
  if (!input) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown';
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  function showCC(q) {
    dropdown.innerHTML = '';
    const matches = q
      ? costCenters.filter(cc =>
          (cc.codigo || '').toLowerCase().includes(q) ||
          (cc.nit    || '').includes(q) ||
          (cc.nombre || '').toLowerCase().includes(q) ||
          (cc.label  || '').toLowerCase().includes(q)
        ).slice(0, 12)
      : costCenters.slice(0, 30);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    matches.forEach(cc => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `<span class="ac-name">${esc(cc.label)}</span><span class="ac-nit">${esc(cc.nit || cc.codigo)}</span>`;
      item.addEventListener('mousedown', () => { input.value = cc.label; dropdown.style.display = 'none'; });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('focus', () => showCC(input.value.toLowerCase().trim()));
  input.addEventListener('input', () => showCC(input.value.toLowerCase().trim()));
  input.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
}

// ── AUTOCOMPLETAR COMERCIAL ───────────────────────────────────────────────────
function setupComercialAutocomplete() {
  const input = document.getElementById('cf_comercial');
  if (!input) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown';
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  function showComerciales(q) {
    dropdown.innerHTML = '';
    const matches = q
      ? COMERCIALES.filter(c => c.cedula.includes(q) || c.nombre.toLowerCase().includes(q)).slice(0, 8)
      : COMERCIALES.slice();
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    matches.forEach(c => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `<span class="ac-name">${esc(c.nombre)}</span><span class="ac-nit">${c.cedula}</span>`;
      item.addEventListener('mousedown', () => { input.value = c.nombre; dropdown.style.display = 'none'; });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('focus', () => showComerciales(input.value.replace(/[,.\s]/g, '').toLowerCase()));
  input.addEventListener('input', () => showComerciales(input.value.replace(/[,.\s]/g, '').toLowerCase()));
  input.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
}

// ══════════════════════════════════════════════════════════════════════════════
// BITÁCORA  (fuente: colección trips — muestra todos los servicios)
// ══════════════════════════════════════════════════════════════════════════════

function renderBitacora() {
  const selectedDate = document.getElementById('pgDate')?.value || '';
  const q = (document.getElementById('bitacoraSearch')?.value || '').toLowerCase().trim();

  const fmtMoney = v => (v || v === 0) && v !== 0 ? '$' + Number(v).toLocaleString('es-CL') : '—';
  const EDIT_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const DEL_SVG  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>`;

  const ocaDateEl = document.getElementById('pgOcaDate');
  if (ocaDateEl) ocaDateEl.textContent = selectedDate ? selectedDate.split('-').reverse().join('/') : '';

  // ── EMPRESARIALES ─────────────────────────────────────────────────────────
  const empBody  = document.getElementById('pgEmpBody');
  const empEmpty = document.getElementById('pgEmpEmpty');
  if (!empBody) return;

  const empRoutes = q
    ? rutas.filter(r => `${r.purchaseOrder||''} ${r.clientFullName||''} ${r.origin||''} ${r.destination||''} ${r.comercial||''}`.toLowerCase().includes(q))
    : rutas;

  if (!empRoutes.length) {
    empBody.innerHTML = '';
    if (empEmpty) empEmpty.style.display = 'flex';
  } else {
    if (empEmpty) empEmpty.style.display = 'none';
    empBody.innerHTML = empRoutes.map((r, i) => {
      const t = selectedDate
        ? trips.find(x => x.routeId === r.id && (x.serviceStartDate || x.departureDate || '').slice(0,10) === selectedDate)
        : null;
      const asignado = !!t;
      const vehicle  = t?.vehicle        || '—';
      const driver   = t?.driver         || '—';
      const phone    = t?.conductorPhone || '—';
      const cost     = Number(t?.cost            ?? r.cost            ?? 0);
      const tval     = Number(t?.transporterValue ?? r.transporterValue ?? 0);
      const utilidad = cost - tval;
      const uClass   = utilidad >= 0 ? 'bt-util-pos' : 'bt-util-neg';
      const tripId   = t ? String(t.id) : '';
      const odsShort = (r.purchaseOrder || '').length > 22 ? r.purchaseOrder.slice(0,22) + '…' : (r.purchaseOrder || '—');
      return `
      <tr class="${asignado ? '' : 'pg-row-pending'}">
        <td>${i + 1}</td>
        <td title="${esc(r.purchaseOrder||'')}">${esc(odsShort)}</td>
        <td>${esc(r.clientFullName || '—')}</td>
        <td>${esc(r.comercial || '—')}</td>
        <td>${esc(r.origin || '—')}</td>
        <td>${esc(r.departureTime || '—')}</td>
        <td>${esc(r.destination || '—')}</td>
        <td>${esc(r.returnTime || '—')}</td>
        <td>${esc(vehicle)}</td>
        <td>${esc(driver)}</td>
        <td>${esc(phone)}</td>
        <td>${fmtMoney(cost)}</td>
        <td>${fmtMoney(tval)}</td>
        <td class="${uClass}">${fmtMoney(utilidad)}</td>
        <td><span class="badge ${asignado ? 'badge-green' : 'badge-pending'}">${asignado ? 'Asignado' : 'Pendiente'}</span></td>
        <td class="actions-cell">
          <button class="btn-icon" title="${asignado ? 'Editar asignación' : 'Asignar conductor'}" onclick="openBitacoraForm(${tripId || 'null'}, '${r.id}')">${EDIT_SVG}</button>
          ${tripId ? `<button class="btn-icon danger" title="Quitar asignación" onclick="confirmDeleteBitacora('${tripId}')">${DEL_SVG}</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ── OCASIONALES ──────────────────────────────────────────────────────────
  const ocaBody  = document.getElementById('pgOcaBody');
  const ocaEmpty = document.getElementById('pgOcaEmpty');
  if (!ocaBody) return;

  const ocasRows = trips.filter(t => {
    if (t.routeId) return false;
    const d = (t.serviceStartDate || t.departureDate || '').slice(0, 10);
    if (selectedDate && d !== selectedDate) return false;
    if (q) {
      const hay = `${t.clientFullName||''} ${t.purchaseOrder||''} ${t.origin||''} ${t.destination||''} ${t.driver||''} ${t.vehicle||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const da = (a.serviceStartDate || a.departureDate || '');
    const db_ = (b.serviceStartDate || b.departureDate || '');
    return db_.localeCompare(da);
  });

  if (!ocasRows.length) {
    ocaBody.innerHTML = '';
    if (ocaEmpty) ocaEmpty.style.display = 'flex';
  } else {
    if (ocaEmpty) ocaEmpty.style.display = 'none';
    ocaBody.innerHTML = ocasRows.map((t, i) => {
      const utilidad = Number(t.cost||0) - Number(t.transporterValue||0);
      const uClass   = utilidad >= 0 ? 'bt-util-pos' : 'bt-util-neg';
      return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(t.purchaseOrder || '—')}</td>
        <td>${esc(t.clientFullName || t.clientName || '—')}</td>
        <td><span class="badge badge-${t.serviceType === 'Empresarial' ? 'blue' : 'green'}">${esc(t.serviceType||'—')}</span></td>
        <td>${esc(t.entryChannel||'—')}</td>
        <td>${esc(t.comercial||'—')}</td>
        <td>${esc(t.origin||'—')}</td>
        <td>${esc(t.departureTime||'—')}</td>
        <td>${esc(t.destination||'—')}</td>
        <td>${esc(t.returnTime||'—')}</td>
        <td>${esc(t.vehicle||'—')}</td>
        <td>${esc(t.proveedor||'—')}</td>
        <td>${esc(t.driver||'—')}</td>
        <td>${esc(t.conductorPhone||'—')}</td>
        <td>${fmtMoney(t.cost)}</td>
        <td>${fmtMoney(t.transporterValue)}</td>
        <td class="${uClass}">${fmtMoney(utilidad)}</td>
        <td class="actions-cell">
          <button class="btn-icon" title="Editar" onclick="openBitacoraForm(${t.id})">${EDIT_SVG}</button>
          <button class="btn-icon danger" title="Eliminar" onclick="confirmDeleteBitacora(${t.id})">${DEL_SVG}</button>
        </td>
      </tr>`;
    }).join('');
  }
}

function openBitacoraForm(tripId, routeId) {
  const rp = document.getElementById('bt_routePicker');
  const fmtV = v => v ? Number(v).toLocaleString('es-CL') : '';

  if (routeId) {
    // Asignar/editar conductor para una ruta empresarial en la fecha seleccionada
    const r = rutas.find(x => x.id === routeId);
    const t = (tripId != null && tripId !== 'null') ? trips.find(x => String(x.id) === String(tripId)) : null;
    const selectedDate = document.getElementById('pgDate')?.value || '';
    if (rp) rp.style.display = 'none';
    document.getElementById('bt_routeId').value       = routeId;
    document.getElementById('bt_id').value            = t ? String(t.id) : '';
    document.getElementById('bt_fecha').value         = t ? (t.serviceStartDate || '').slice(0,10) : selectedDate;
    document.getElementById('bt_ods').value           = r?.purchaseOrder  || '';
    document.getElementById('bt_cliente').value       = r?.clientFullName || '';
    document.getElementById('bt_clienteNit').value    = r?.clientNit      || '';
    document.getElementById('bt_tipo').value          = 'Empresarial';
    document.getElementById('bt_canal').value         = t?.entryChannel   || 'Cliente Antiguo';
    document.getElementById('bt_comercial').value     = r?.comercial      || '';
    document.getElementById('bt_origen').value        = r?.origin         || '';
    document.getElementById('bt_horaSalida').value    = r?.departureTime  || '';
    document.getElementById('bt_destino').value       = r?.destination    || '';
    document.getElementById('bt_horaRegreso').value   = r?.returnTime     || '';
    document.getElementById('bt_placa').value         = t?.vehicle        || '';
    document.getElementById('bt_proveedor').value     = t?.proveedor      || r?.proveedor || 'Tercero';
    document.getElementById('bt_conductor').value     = t?.driver         || '';
    document.getElementById('bt_conductorCel').value  = t?.conductorPhone || '';
    document.getElementById('bt_valorServicio').value  = fmtV(t?.cost            ?? r?.cost);
    document.getElementById('bt_valorProveedor').value = fmtV(t?.transporterValue ?? r?.transporterValue);
    document.getElementById('bitacoraFormTitle').textContent = t ? 'Editar Asignación' : 'Asignar Conductor';

  } else if (tripId != null && tripId !== 'null') {
    // Editar viaje ocasional
    const t = trips.find(x => String(x.id) === String(tripId));
    if (rp) rp.style.display = 'none';
    document.getElementById('bt_routeId').value       = '';
    document.getElementById('bt_id').value            = String(tripId);
    document.getElementById('bt_fecha').value         = (t?.serviceStartDate || t?.departureDate || '').slice(0,10);
    document.getElementById('bt_ods').value           = t?.purchaseOrder  || '';
    document.getElementById('bt_cliente').value       = t?.clientFullName || t?.clientName || '';
    document.getElementById('bt_clienteNit').value    = t?.clientNit      || '';
    document.getElementById('bt_tipo').value          = t?.serviceType    || 'Empresarial';
    document.getElementById('bt_canal').value         = t?.entryChannel   || 'Cliente Antiguo';
    document.getElementById('bt_comercial').value     = t?.comercial      || '';
    document.getElementById('bt_origen').value        = t?.origin         || '';
    document.getElementById('bt_horaSalida').value    = t?.departureTime  || '';
    document.getElementById('bt_destino').value       = t?.destination    || '';
    document.getElementById('bt_horaRegreso').value   = t?.returnTime     || '';
    document.getElementById('bt_placa').value         = t?.vehicle        || '';
    document.getElementById('bt_proveedor').value     = t?.proveedor      || 'Tercero';
    document.getElementById('bt_conductor').value     = t?.driver         || '';
    document.getElementById('bt_conductorCel').value  = t?.conductorPhone || '';
    document.getElementById('bt_valorServicio').value  = fmtV(t?.cost);
    document.getElementById('bt_valorProveedor').value = fmtV(t?.transporterValue);
    document.getElementById('bitacoraFormTitle').textContent = 'Editar Servicio';

  } else {
    // Nuevo empresarial — muestra buscador de ruta
    if (rp) rp.style.display = 'block';
    document.getElementById('bt_routeId').value       = '';
    document.getElementById('bt_id').value            = '';
    document.getElementById('bt_fecha').value         = document.getElementById('pgDate')?.value || '';
    document.getElementById('bt_ods').value           = '';
    document.getElementById('bt_cliente').value       = '';
    document.getElementById('bt_clienteNit').value    = '';
    document.getElementById('bt_tipo').value          = 'Empresarial';
    document.getElementById('bt_canal').value         = 'Cliente Antiguo';
    document.getElementById('bt_comercial').value     = '';
    document.getElementById('bt_origen').value        = '';
    document.getElementById('bt_horaSalida').value    = '';
    document.getElementById('bt_destino').value       = '';
    document.getElementById('bt_horaRegreso').value   = '';
    document.getElementById('bt_placa').value         = '';
    document.getElementById('bt_proveedor').value     = 'Tercero';
    document.getElementById('bt_conductor').value     = '';
    document.getElementById('bt_conductorCel').value  = '';
    document.getElementById('bt_valorServicio').value  = '';
    document.getElementById('bt_valorProveedor').value = '';
    const rs = document.getElementById('bt_rutaSearch');
    if (rs) rs.value = '';
    document.getElementById('bitacoraFormTitle').textContent = 'Nuevo Servicio Empresarial';
  }

  document.getElementById('bitacoraOverlay').classList.add('open');
}

function closeBitacoraForm() {
  document.getElementById('bitacoraOverlay').classList.remove('open');
}

function saveBitacora() {
  const tripId  = document.getElementById('bt_id').value.trim();
  const routeId = document.getElementById('bt_routeId').value.trim();
  const fecha   = document.getElementById('bt_fecha').value;

  if (!fecha) { showToast('Completa la Fecha', 'error'); return; }

  const parseBt = id => Number((document.getElementById(id)?.value || '0').replace(/\./g, '').replace(/,/g, '')) || 0;
  const btn = document.getElementById('bt_saveBtn');
  btn.disabled = true;

  if (routeId) {
    // Asignación de conductor a una ruta empresarial
    const r = rutas.find(x => x.id === routeId);
    if (!r) { showToast('Ruta no encontrada', 'error'); btn.disabled = false; return; }

    const base = {
      routeId,
      serviceStartDate: fecha,
      departureDate:    fecha,
      purchaseOrder:    r.purchaseOrder    || '',
      clientFullName:   r.clientFullName   || '',
      clientNit:        r.clientNit        || '',
      serviceType:      'Empresarial',
      entryChannel:     'EMPRESARIAL',
      comercial:        r.comercial        || '',
      origin:           r.origin           || '',
      departureTime:    r.departureTime    || '',
      destination:      r.destination      || '',
      returnTime:       r.returnTime       || '',
      proveedor:        document.getElementById('bt_proveedor').value,
      vehicle:          document.getElementById('bt_placa').value.trim(),
      driver:           document.getElementById('bt_conductor').value.trim(),
      conductorPhone:   document.getElementById('bt_conductorCel').value.trim(),
      cost:             parseBt('bt_valorServicio'),
      transporterValue: parseBt('bt_valorProveedor'),
      updatedAt:        new Date().toISOString(),
    };

    let ref, data;
    if (tripId) {
      ref  = db.collection('trips').doc(tripId);
      data = base;
    } else {
      const newId = nextId();
      ref  = db.collection('trips').doc(String(newId));
      data = { ...base, id: newId, clientName: r.clientFullName || '', paymentStatus: 'Pendiente', tripStatus: 'Pendiente', internalNotes: '', createdAt: new Date().toISOString() };
    }

    ref.set(data, { merge: true })
      .then(() => { closeBitacoraForm(); showToast(tripId ? 'Asignación actualizada' : 'Conductor asignado', 'success'); })
      .catch(() => showToast('Error al guardar', 'error'))
      .finally(() => { btn.disabled = false; });

  } else {
    // Viaje ocasional (manual, sin ruta plantilla)
    const cliente = document.getElementById('bt_cliente').value.trim();
    const origen  = document.getElementById('bt_origen').value.trim();
    const destino = document.getElementById('bt_destino').value.trim();
    if (!cliente || !origen || !destino) {
      showToast('Completa Cliente, Origen y Destino', 'error');
      btn.disabled = false;
      return;
    }

    const base = {
      serviceStartDate: fecha,
      departureDate:    fecha,
      purchaseOrder:    document.getElementById('bt_ods').value.trim(),
      clientFullName:   cliente,
      clientNit:        document.getElementById('bt_clienteNit').value.trim(),
      serviceType:      document.getElementById('bt_tipo').value,
      entryChannel:     document.getElementById('bt_canal').value,
      comercial:        document.getElementById('bt_comercial').value.trim(),
      origin:           origen,
      departureTime:    document.getElementById('bt_horaSalida').value,
      destination:      destino,
      returnTime:       document.getElementById('bt_horaRegreso').value.trim() || 'N/A',
      vehicle:          document.getElementById('bt_placa').value.trim(),
      proveedor:        document.getElementById('bt_proveedor').value,
      driver:           document.getElementById('bt_conductor').value.trim(),
      conductorPhone:   document.getElementById('bt_conductorCel').value.trim(),
      cost:             parseBt('bt_valorServicio'),
      transporterValue: parseBt('bt_valorProveedor'),
      updatedAt:        new Date().toISOString(),
    };

    let ref, data;
    if (tripId) {
      ref  = db.collection('trips').doc(tripId);
      data = base;
    } else {
      const newId = nextId();
      ref  = db.collection('trips').doc(String(newId));
      data = { ...base, id: newId, clientName: cliente, clientPhone: '', clientEmail: '', invoiceEmail: '', invoiceDetail: '', paymentMethod: '', paymentStatus: 'Pendiente', tripStatus: 'Pendiente', internalNotes: '', costCenter: '', serviceEndDate: fecha, returnDate: fecha, passengers: '', observations: '', dueDate: '', invoiceDate: '', createdAt: new Date().toISOString() };
    }

    ref.set(data, { merge: true })
      .then(() => { closeBitacoraForm(); showToast(tripId ? 'Servicio actualizado' : 'Servicio creado', 'success'); })
      .catch(() => showToast('Error al guardar', 'error'))
      .finally(() => { btn.disabled = false; });
  }
}

function confirmDeleteBitacora(tripId) {
  btDeleteId = String(tripId);
  document.getElementById('btConfirmOverlay').classList.add('open');
}

document.getElementById('btConfirmDelete').addEventListener('click', () => {
  if (!btDeleteId) return;
  db.collection('trips').doc(btDeleteId).delete()
    .then(() => showToast('Servicio eliminado', 'success'))
    .catch(() => showToast('Error al eliminar', 'error'));
  document.getElementById('btConfirmOverlay').classList.remove('open');
  btDeleteId = null;
});

// Autocomplete en el modal de bitácora
function setupBitacoraAutocomplete() {
  // Placa → auto-rellena conductor y celular
  const placaInput = document.getElementById('bt_placa');
  if (placaInput) {
    const dd = document.createElement('div');
    dd.className = 'ac-dropdown';
    placaInput.parentElement.style.position = 'relative';
    placaInput.parentElement.appendChild(dd);
    function showPlacas(q) {
      dd.innerHTML = '';
      const matches = q
        ? conductores.filter(c => (c.placa||'').toLowerCase().includes(q) || (c.conductor||'').toLowerCase().includes(q)).slice(0, 10)
        : conductores.slice(0, 20);
      if (!matches.length) { dd.style.display = 'none'; return; }
      matches.forEach(c => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = `<span class="ac-name">${esc(c.placa)}</span><span class="ac-nit">${esc(c.conductor)} · ${c.pax}pax</span>`;
        item.addEventListener('mousedown', () => {
          placaInput.value = c.placa;
          document.getElementById('bt_conductor').value    = c.conductor || '';
          document.getElementById('bt_conductorCel').value = c.celular   || '';
          dd.style.display = 'none';
        });
        dd.appendChild(item);
      });
      dd.style.display = 'block';
    }
    placaInput.addEventListener('focus', () => showPlacas(placaInput.value.toLowerCase().trim()));
    placaInput.addEventListener('input', () => showPlacas(placaInput.value.toLowerCase().trim()));
    placaInput.addEventListener('blur',  () => setTimeout(() => { dd.style.display = 'none'; }, 200));
  }
  // Comercial
  setupGenericAC('bt_comercial', () => COMERCIALES.map(c => ({ label: c.nombre, sub: c.cedula })));
  // Cliente
  setupGenericAC('bt_cliente', () => clients.map(c => ({ label: c.clientFullName || c.nombre, sub: c.clientNit })),
    lbl => {
      const c = clients.find(x => (x.clientFullName || x.nombre) === lbl);
      if (c) document.getElementById('bt_clienteNit').value = c.clientNit || '';
    }
  );

  // Buscador de ruta empresarial (route picker en modal)
  const rutaSearch  = document.getElementById('bt_rutaSearch');
  const rutaResults = document.getElementById('bt_rutaResults');
  if (rutaSearch && rutaResults) {
    function showRutas(q) {
      rutaResults.innerHTML = '';
      const matches = q
        ? rutas.filter(r => `${r.clientFullName||''} ${r.purchaseOrder||''} ${r.origin||''} ${r.destination||''}`.toLowerCase().includes(q)).slice(0, 15)
        : rutas.slice(0, 20);
      if (!matches.length) { rutaResults.style.display = 'none'; return; }
      matches.forEach(r => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = `<span class="ac-name">${esc(r.purchaseOrder || r.clientFullName)}</span><span class="ac-nit">${esc(r.clientFullName)} · ${esc(r.origin||'')} → ${esc(r.destination||'')}</span>`;
        item.addEventListener('mousedown', () => {
          document.getElementById('bt_routeId').value       = r.id;
          document.getElementById('bt_ods').value           = r.purchaseOrder  || '';
          document.getElementById('bt_cliente').value       = r.clientFullName || '';
          document.getElementById('bt_clienteNit').value    = r.clientNit      || '';
          document.getElementById('bt_origen').value        = r.origin         || '';
          document.getElementById('bt_horaSalida').value    = r.departureTime  || '';
          document.getElementById('bt_destino').value       = r.destination    || '';
          document.getElementById('bt_horaRegreso').value   = r.returnTime     || '';
          document.getElementById('bt_valorServicio').value  = r.cost ? Number(r.cost).toLocaleString('es-CL') : '';
          document.getElementById('bt_valorProveedor').value = r.transporterValue ? Number(r.transporterValue).toLocaleString('es-CL') : '';
          document.getElementById('bt_tipo').value          = 'Empresarial';
          rutaResults.style.display = 'none';
          rutaSearch.value = r.clientFullName;
          document.getElementById('bitacoraFormTitle').textContent = 'Asignar: ' + (r.purchaseOrder || r.clientFullName);
        });
        rutaResults.appendChild(item);
      });
      rutaResults.style.display = 'block';
    }
    rutaSearch.addEventListener('focus', () => showRutas(rutaSearch.value.toLowerCase()));
    rutaSearch.addEventListener('input', () => showRutas(rutaSearch.value.toLowerCase()));
    rutaSearch.addEventListener('blur',  () => setTimeout(() => { rutaResults.style.display = 'none'; }, 200));
  }
}

function setupGenericAC(inputId, getItems, onSelect) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const dropdown = document.createElement('div');
  dropdown.className = 'ac-dropdown';
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(dropdown);

  function show(q) {
    dropdown.innerHTML = '';
    const all = getItems();
    const matches = q
      ? all.filter(i => i.label.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q)).slice(0, 10)
      : all.slice(0, 20);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    matches.forEach(i => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `<span class="ac-name">${esc(i.label)}</span><span class="ac-nit">${esc(i.sub || '')}</span>`;
      item.addEventListener('mousedown', () => {
        input.value = i.label;
        dropdown.style.display = 'none';
        if (onSelect) onSelect(i.label);
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('focus', () => show(input.value.toLowerCase().trim()));
  input.addEventListener('input', () => show(input.value.toLowerCase().trim()));
  input.addEventListener('blur',  () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
}

// Formato de precios en el modal de bitácora
['bt_valorServicio', 'bt_valorProveedor'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const raw = el.value.replace(/\D/g, '');
    el.value  = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  });
});

// ── INIT ──────────────────────────────────────────────────────────────────────
showClientForm();
setupClientAutocomplete();
setupCostCenterAutocomplete();
setupComercialAutocomplete();
setupBitacoraAutocomplete();

// Toggle sección cliente antiguo / nuevo
document.querySelectorAll('input[name="cf_clientStatus"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const val = document.querySelector('input[name="cf_clientStatus"]:checked')?.value;
    document.getElementById('cf_secAntiguo').style.display = val === 'antiguo' ? 'block' : 'none';
    document.getElementById('cf_secNuevo').style.display   = val === 'nuevo'   ? 'block' : 'none';
  });
});

// Toggle persona / empresa dentro del formulario nuevo
document.getElementById('cf_newTipo').addEventListener('change', function () {
  document.getElementById('cf_personaFields').style.display = this.value === 'persona' ? 'block' : 'none';
  document.getElementById('cf_empresaFields').style.display = this.value === 'empresa' ? 'block' : 'none';
});
