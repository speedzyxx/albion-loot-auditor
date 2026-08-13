use crate::models::NpcapStatus;
use std::path::PathBuf;

const NPCAP_DLL_CANDIDATES: &[&str] = &[
    r"C:\Windows\System32\Npcap\wpcap.dll",
    r"C:\Windows\System32\wpcap.dll",
    r"C:\Windows\SysWOW64\Npcap\wpcap.dll",
];

const NPCAP_INSTALLER_URL: &str = "https://npcap.com/#download";

pub fn detect() -> NpcapStatus {
    if let Some(path) = find_dll() {
        return NpcapStatus {
            installed: true,
            dll_path: Some(path.display().to_string()),
            version_hint: Some("Npcap / WinPcap API".into()),
            message: "Npcap detectado. La captura de paquetes está lista.".into(),
        };
    }

    // Last-resort: the DLL may already be on the loader search path.
    if unsafe { try_load("wpcap.dll") } {
        return NpcapStatus {
            installed: true,
            dll_path: Some("wpcap.dll".into()),
            version_hint: Some("Npcap (PATH)".into()),
            message: "Npcap detectado en el PATH del sistema.".into(),
        };
    }

    NpcapStatus {
        installed: false,
        dll_path: None,
        version_hint: None,
        message: "Npcap no está instalado. Sin el driver no se puede leer el tráfico UDP de Albion.".into(),
    }
}

pub fn find_dll() -> Option<PathBuf> {
    for candidate in NPCAP_DLL_CANDIDATES {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }
    None
}

pub fn installer_url() -> &'static str {
    NPCAP_INSTALLER_URL
}

unsafe fn try_load(name: &str) -> bool {
    libloading::Library::new(name).is_ok()
}

pub fn load_wpcap() -> Result<libloading::Library, String> {
    if let Some(path) = find_dll() {
        return unsafe {
            libloading::Library::new(&path)
                .map_err(|e| format!("No se pudo cargar {}: {e}", path.display()))
        };
    }
    unsafe {
        libloading::Library::new("wpcap.dll")
            .map_err(|e| format!("No se pudo cargar wpcap.dll: {e}"))
    }
}
