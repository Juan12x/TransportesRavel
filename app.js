'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ADMIN_PIN = '1234';

// EmailJS — reemplaza estos valores con los tuyos
const EMAILJS_PUBLIC_KEY  = 'x9B031X2tsq-uzKaN';
const EMAILJS_SERVICE_ID  = 'TransportesRavel';               // tu Service ID
const EMAILJS_TEMPLATE_ID = 'template_rmowjnt';

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
const db = firebase.firestore();

// ── STATE ─────────────────────────────────────────────────────────────────────
let trips          = [];
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
  }
}, () => showToast('Error al conectar con la base de datos', 'error'));

function save() {}

function nextId() {
  return trips.reduce((max, t) => t.id > max ? t.id : max, 0) + 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// VISTA CLIENTE
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('clientForm').addEventListener('submit', e => {
  e.preventDefault();

  const paymentMethodEl = document.querySelector('input[name="cf_paymentMethod"]:checked');

  const trip = {
    id:               nextId(),
    clientName:       document.getElementById('cf_name').value.trim(),
    clientPhone:      document.getElementById('cf_phone').value.trim(),
    clientEmail:      document.getElementById('cf_email').value.trim(),
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
    cost:             Number(document.getElementById('cf_serviceValue').value) || 0,
    transporterValue: Number(document.getElementById('cf_transporterValue').value) || 0,
    invoiceDetail:    document.getElementById('cf_invoiceDetail').value.trim(),
    paymentMethod:    paymentMethodEl ? paymentMethodEl.value : '',
    dueDate:          document.getElementById('cf_dueDate').value,
    invoiceEmail:     document.getElementById('cf_invoiceEmail').value.trim(),
    supportDocs:      document.getElementById('cf_supportDocs').value.trim(),
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
      sendNotificationEmail(trip);
      showClientSuccess();
    })
    .catch(() => showToast('Error al enviar la solicitud', 'error'));
});

function showClientSuccess() {
  document.getElementById('clientFormCard').style.display   = 'none';
  document.getElementById('clientSuccessCard').style.display = 'flex';
}

function showClientForm() {
  document.getElementById('clientForm').reset();
  document.getElementById('clientFormCard').style.display   = 'block';
  document.getElementById('clientSuccessCard').style.display = 'none';
}

document.getElementById('newRequestBtn').addEventListener('click', showClientForm);

function sendNotificationEmail(trip) {
  const fmt = v => v || '—';
  const fmtMoney = v => v ? '$' + Number(v).toLocaleString('es-CO') : '—';
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
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
  }).catch(() => {});
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

  const titles = { dashboard: 'Dashboard', records: 'Registros', new: 'Nuevo Viaje', calendar: 'Calendario' };
  document.getElementById('topbarTitle').textContent = titles[name] || '';

  currentView = name;
  closeSidebar();

  if (name === 'dashboard') renderDashboard();
  if (name === 'records')   renderRecords();
  if (name === 'calendar')  renderCalendar();
  if (name === 'new' && !editingId) resetForm();
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
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
  const now = new Date();
  const upcoming = trips
    .filter(t => t.departureDate && new Date(t.departureDate) >= now && t.tripStatus !== 'Cancelado' && t.tripStatus !== 'Completado')
    .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate))
    .slice(0, 5);

  const el = document.getElementById('upcomingList');
  if (!upcoming.length) {
    el.innerHTML = '<div class="upcoming-empty">No hay viajes próximos programados.</div>';
    return;
  }

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  el.innerHTML = upcoming.map(t => {
    const d = new Date(t.departureDate);
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
    const matchSearch  = !search || [t.clientName, t.origin, t.destination, t.clientRut, t.clientPhone]
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
    cost:          Number(document.getElementById('cost').value) || 0,
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

// ── INIT ──────────────────────────────────────────────────────────────────────
showClientForm();
