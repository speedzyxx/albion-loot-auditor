use crate::albion::{SessionEvent, SessionWorld};
use crate::models::{CaptureStatus, NpcapStatus};
use crate::npcap;
use crate::photon::PhotonParser;
use parking_lot::Mutex;
use std::ffi::{c_char, c_int, c_uint, CStr, CString};
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const FILTER: &str = "ip and udp and (port 5056 or port 5055 or port 5058 or port 4535)";
const SNAPLEN: c_int = 65535;
const TIMEOUT_MS: c_int = 1;
const PCAP_ERRBUF: usize = 256;

#[repr(C)]
struct PcapIf {
    next: *mut PcapIf,
    name: *mut c_char,
    description: *mut c_char,
    addresses: *mut std::ffi::c_void,
    flags: c_uint,
}

#[repr(C)]
struct TimeVal {
    tv_sec: i32,
    tv_usec: i32,
}

#[repr(C)]
struct PcapPkthdr {
    ts: TimeVal,
    caplen: c_uint,
    len: c_uint,
}

#[repr(C)]
struct BpfProgram {
    bf_len: c_uint,
    bf_insns: *mut std::ffi::c_void,
}

type PcapHandle = *mut std::ffi::c_void;

struct PcapApi {
    _lib: libloading::Library,
    findalldevs: libloading::Symbol<'static, unsafe extern "C" fn(*mut *mut PcapIf, *mut c_char) -> c_int>,
    freealldevs: libloading::Symbol<'static, unsafe extern "C" fn(*mut PcapIf)>,
    open_live: libloading::Symbol<
        'static,
        unsafe extern "C" fn(*const c_char, c_int, c_int, c_int, *mut c_char) -> PcapHandle,
    >,
    compile: libloading::Symbol<
        'static,
        unsafe extern "C" fn(PcapHandle, *mut BpfProgram, *const c_char, c_int, c_uint) -> c_int,
    >,
    setfilter: libloading::Symbol<'static, unsafe extern "C" fn(PcapHandle, *mut BpfProgram) -> c_int>,
    next_ex: libloading::Symbol<
        'static,
        unsafe extern "C" fn(PcapHandle, *mut *mut PcapPkthdr, *mut *const u8) -> c_int,
    >,
    close: libloading::Symbol<'static, unsafe extern "C" fn(PcapHandle)>,
    datalink: libloading::Symbol<'static, unsafe extern "C" fn(PcapHandle) -> c_int>,
}

impl PcapApi {
    fn load() -> Result<Self, String> {
        let lib = npcap::load_wpcap()?;
        unsafe {
            let findalldevs = transmute_symbol(&lib, b"pcap_findalldevs\0")?;
            let freealldevs = transmute_symbol(&lib, b"pcap_freealldevs\0")?;
            let open_live = transmute_symbol(&lib, b"pcap_open_live\0")?;
            let compile = transmute_symbol(&lib, b"pcap_compile\0")?;
            let setfilter = transmute_symbol(&lib, b"pcap_setfilter\0")?;
            let next_ex = transmute_symbol(&lib, b"pcap_next_ex\0")?;
            let close = transmute_symbol(&lib, b"pcap_close\0")?;
            let datalink = transmute_symbol(&lib, b"pcap_datalink\0")?;
            Ok(Self {
                _lib: lib,
                findalldevs,
                freealldevs,
                open_live,
                compile,
                setfilter,
                next_ex,
                close,
                datalink,
            })
        }
    }
}

unsafe fn transmute_symbol<T: Copy>(
    lib: &libloading::Library,
    name: &[u8],
) -> Result<libloading::Symbol<'static, T>, String> {
    let sym: libloading::Symbol<T> = lib
        .get(name)
        .map_err(|e| format!("Símbolo pcap faltante: {e}"))?;
    Ok(std::mem::transmute::<libloading::Symbol<'_, T>, libloading::Symbol<'static, T>>(
        sym,
    ))
}

pub struct CaptureEngine {
    running: Arc<AtomicBool>,
    packets: Arc<AtomicU64>,
    decoded: Arc<AtomicU64>,
    live: Arc<AtomicBool>,
    devices: Arc<Mutex<Vec<String>>>,
    last_error: Arc<Mutex<Option<String>>>,
    current_map: Arc<Mutex<Option<String>>>,
    clusters: Arc<Mutex<u32>>,
    local_player: Arc<Mutex<Option<String>>>,
}

impl CaptureEngine {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            packets: Arc::new(AtomicU64::new(0)),
            decoded: Arc::new(AtomicU64::new(0)),
            live: Arc::new(AtomicBool::new(false)),
            devices: Arc::new(Mutex::new(Vec::new())),
            last_error: Arc::new(Mutex::new(None)),
            current_map: Arc::new(Mutex::new(None)),
            clusters: Arc::new(Mutex::new(0)),
            local_player: Arc::new(Mutex::new(None)),
        }
    }

    pub fn status(&self, npcap: NpcapStatus) -> CaptureStatus {
        CaptureStatus {
            running: self.running.load(Ordering::Relaxed),
            npcap,
            devices: self.devices.lock().clone(),
            packets: self.packets.load(Ordering::Relaxed),
            decoded: self.decoded.load(Ordering::Relaxed),
            live: self.live.load(Ordering::Relaxed),
            error: self.last_error.lock().clone(),
            map: self.current_map.lock().clone(),
            clusters: *self.clusters.lock(),
            local_player: self.local_player.lock().clone(),
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        self.live.store(false, Ordering::Relaxed);
    }

    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Ok(());
        }
        let npcap = npcap::detect();
        if !npcap.installed {
            return Err(npcap.message);
        }
        let api = PcapApi::load()?;
        self.running.store(true, Ordering::Relaxed);
        self.packets.store(0, Ordering::Relaxed);
        self.decoded.store(0, Ordering::Relaxed);
        *self.last_error.lock() = None;

        let running = self.running.clone();
        let packets = self.packets.clone();
        let decoded = self.decoded.clone();
        let live = self.live.clone();
        let devices = self.devices.clone();
        let last_error = self.last_error.clone();
        let current_map = self.current_map.clone();
        let clusters = self.clusters.clone();
        let local_player = self.local_player.clone();

        thread::spawn(move || {
            if let Err(err) = capture_loop(
                api,
                app,
                running.clone(),
                packets,
                decoded,
                live.clone(),
                devices,
                current_map,
                clusters,
                local_player,
            ) {
                *last_error.lock() = Some(err);
            }
            running.store(false, Ordering::Relaxed);
            live.store(false, Ordering::Relaxed);
        });
        Ok(())
    }
}

fn capture_loop(
    api: PcapApi,
    app: AppHandle,
    running: Arc<AtomicBool>,
    packets: Arc<AtomicU64>,
    decoded: Arc<AtomicU64>,
    live: Arc<AtomicBool>,
    devices: Arc<Mutex<Vec<String>>>,
    current_map: Arc<Mutex<Option<String>>>,
    clusters: Arc<Mutex<u32>>,
    local_player: Arc<Mutex<Option<String>>>,
) -> Result<(), String> {
    let names = unsafe { list_devices(&api)? };
    *devices.lock() = names.clone();
    if names.is_empty() {
        return Err("No se encontraron interfaces de red.".into());
    }

    let mut handles = Vec::new();
    let mut errbuf = vec![0i8; PCAP_ERRBUF];
    for name in &names {
        let cname = CString::new(name.as_str()).map_err(|_| "nombre de dispositivo inválido")?;
        unsafe {
            let handle = (api.open_live)(
                cname.as_ptr(),
                SNAPLEN,
                1,
                TIMEOUT_MS,
                errbuf.as_mut_ptr() as *mut c_char,
            );
            if handle.is_null() {
                continue;
            }
            let link = (api.datalink)(handle);
            // 1 = Ethernet, 0 = NULL/loopback, 12 = raw IP (Npcap on some adapters)
            if link != 1 && link != 0 && link != 12 && link != 101 {
                (api.close)(handle);
                continue;
            }
            let mut program = BpfProgram {
                bf_len: 0,
                bf_insns: ptr::null_mut(),
            };
            let filter = CString::new(FILTER).unwrap();
            if (api.compile)(handle, &mut program, filter.as_ptr(), 1, 0xFFFFFF) == 0 {
                let _ = (api.setfilter)(handle, &mut program);
            }
            handles.push((handle, link));
        }
    }

    if handles.is_empty() {
        return Err(
            "No se pudo abrir ninguna interfaz. Ejecuta la app como administrador y reinstala Npcap con compatibilidad WinPcap."
                .into(),
        );
    }

    let _ = app.emit(
        "capture-log",
        format!("Capturando en {} interfaz(es)", handles.len()),
    );

    let mut parser = PhotonParser::new();
    let mut world = SessionWorld::default();
    world.item_names = crate::items::load_catalog();
    world.clusters = crate::world::ClusterBook::load();
    world.current_map = current_map.lock().clone();
    *clusters.lock() = world.clusters.len() as u32;
    let _ = app.emit(
        "capture-log",
        format!(
            "Catálogo: {} ítems · {} clusters",
            world.item_names.len(),
            world.clusters.len()
        ),
    );
    let mut last_packet = std::time::Instant::now();

    while running.load(Ordering::Relaxed) {
        let mut saw = false;
        for (handle, link) in &handles {
            unsafe {
                loop {
                    let mut hdr: *mut PcapPkthdr = ptr::null_mut();
                    let mut data: *const u8 = ptr::null();
                    let rc = (api.next_ex)(*handle, &mut hdr, &mut data);
                    if rc != 1 || hdr.is_null() || data.is_null() {
                        break;
                    }
                    let caplen = (*hdr).caplen as usize;
                    if caplen == 0 || caplen > 65535 {
                        continue;
                    }
                    let frame = std::slice::from_raw_parts(data, caplen);
                    saw = true;
                    packets.fetch_add(1, Ordering::Relaxed);
                    last_packet = std::time::Instant::now();
                    live.store(true, Ordering::Relaxed);

                    if let Some(udp) = extract_udp(frame, *link) {
                        let messages = parser.handle_udp(udp);
                        if messages.is_empty() {
                            continue;
                        }
                        decoded.fetch_add(messages.len() as u64, Ordering::Relaxed);
                        let events = world.ingest(messages);
                        emit_events(&app, events, &current_map, &local_player);
                    }
                }
            }
        }
        if !saw {
            thread::sleep(Duration::from_millis(1));
        }
        if last_packet.elapsed() > Duration::from_secs(6) {
            live.store(false, Ordering::Relaxed);
        }
    }

    unsafe {
        for (handle, _) in handles {
            (api.close)(handle);
        }
    }
    Ok(())
}

fn emit_events(
    app: &AppHandle,
    events: Vec<SessionEvent>,
    current_map: &Mutex<Option<String>>,
    local_player: &Mutex<Option<String>>,
) {
    let mut damage = Vec::new();
    let mut heals = Vec::new();
    for event in events {
        match event {
            SessionEvent::Cluster(info) => {
                *current_map.lock() = Some(info.map.clone());
                let _ = app.emit("cluster", SessionEvent::Cluster(info));
            }
            SessionEvent::Player(info) => {
                if info.is_local {
                    *local_player.lock() = Some(info.name.clone());
                }
                let _ = app.emit("player", SessionEvent::Player(info));
            }
            SessionEvent::Damage(hit) => damage.push(hit),
            SessionEvent::Heal(hit) => heals.push(hit),
            other => emit_event(app, other),
        }
    }
    if !damage.is_empty() {
        let _ = app.emit("damage-batch", &damage);
    }
    if !heals.is_empty() {
        let _ = app.emit("heal-batch", &heals);
    }
}

fn emit_event(app: &AppHandle, event: SessionEvent) {
    match &event {
        SessionEvent::Loot(_) => {
            let _ = app.emit("loot", &event);
        }
        SessionEvent::Death(_) => {
            let _ = app.emit("death", &event);
        }
        SessionEvent::Trade(_) => {
            let _ = app.emit("trade", &event);
        }
        SessionEvent::Storage(_) => {
            let _ = app.emit("storage", &event);
        }
        SessionEvent::Player(_) => {
            let _ = app.emit("player", &event);
        }
        SessionEvent::Cluster(_) => {
            let _ = app.emit("cluster", &event);
        }
        SessionEvent::Damage(_) => {
            let _ = app.emit("damage", &event);
        }
        SessionEvent::Heal(_) => {
            let _ = app.emit("heal", &event);
        }
        SessionEvent::Build(_) => {
            let _ = app.emit("build", &event);
        }
    }
    let _ = app.emit("session-event", &event);
}

fn extract_udp(frame: &[u8], datalink: c_int) -> Option<&[u8]> {
    let ip = match datalink {
        1 => skip_ethernet(frame)?,
        0 => frame.get(4..)?,
        12 | 101 => frame,
        113 => frame.get(16..)?,
        _ => skip_ethernet(frame).or(Some(frame))?,
    };
    ipv4_udp_payload(ip)
}

fn skip_ethernet(frame: &[u8]) -> Option<&[u8]> {
    if frame.len() < 14 {
        return None;
    }
    let mut ethertype = u16::from_be_bytes([frame[12], frame[13]]);
    let mut offset = 14usize;
    if ethertype == 0x8100 && frame.len() >= 18 {
        ethertype = u16::from_be_bytes([frame[16], frame[17]]);
        offset = 18;
    }
    if ethertype != 0x0800 {
        return None;
    }
    frame.get(offset..)
}

fn ipv4_udp_payload(ip: &[u8]) -> Option<&[u8]> {
    if ip.len() < 20 {
        return None;
    }
    if ip[0] >> 4 != 4 {
        return None;
    }
    let ihl = (ip[0] & 0x0F) as usize * 4;
    if ihl < 20 || ip.len() < ihl + 8 {
        return None;
    }
    if ip[9] != 17 {
        return None;
    }
    let udp = &ip[ihl..];
    let sport = u16::from_be_bytes([udp[0], udp[1]]);
    let dport = u16::from_be_bytes([udp[2], udp[3]]);
    if !matches!(sport, 5055 | 5056 | 5058 | 4535) && !matches!(dport, 5055 | 5056 | 5058 | 4535) {
        return None;
    }
    let declared = u16::from_be_bytes([udp[4], udp[5]]) as usize;
    // Windows TSO/checksum offload often writes UDP length 0 or a truncated
    // value. Prefer the declared length only when it fits the capture.
    if declared > 8 && declared <= udp.len() {
        udp.get(8..declared)
    } else {
        udp.get(8..)
    }
}

unsafe fn list_devices(api: &PcapApi) -> Result<Vec<String>, String> {
    let mut all: *mut PcapIf = ptr::null_mut();
    let mut errbuf = vec![0i8; PCAP_ERRBUF];
    let rc = (api.findalldevs)(&mut all, errbuf.as_mut_ptr() as *mut c_char);
    if rc != 0 {
        let msg = CStr::from_ptr(errbuf.as_ptr() as *const c_char)
            .to_string_lossy()
            .into_owned();
        return Err(format!("pcap_findalldevs: {msg}"));
    }
    let mut names = Vec::new();
    let mut cur = all;
    while !cur.is_null() {
        if !(*cur).name.is_null() {
            let name = CStr::from_ptr((*cur).name).to_string_lossy().into_owned();
            let desc = if (*cur).description.is_null() {
                String::new()
            } else {
                CStr::from_ptr((*cur).description)
                    .to_string_lossy()
                    .into_owned()
            };
            let skip = name.to_lowercase().contains("loopback")
                || desc.to_lowercase().contains("loopback")
                || name.contains("npcap_loopback");
            if !skip {
                names.push(name);
            }
        }
        cur = (*cur).next;
    }
    (api.freealldevs)(all);
    Ok(names)
}
