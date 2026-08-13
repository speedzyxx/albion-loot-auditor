//! Photon command envelope + Protocol16 / Protocol18 payload decoding.
//! Layout follows the public Photon wire format used by community Albion tools.

use serde::Serialize;
use std::collections::BTreeMap;
use std::collections::HashMap;

const PHOTON_HEADER: usize = 12;
const COMMAND_HEADER: usize = 12;
const FRAGMENT_HEADER: usize = 20;

const CMD_DISCONNECT: u8 = 0x04;
const CMD_SEND_RELIABLE: u8 = 0x06;
const CMD_SEND_UNRELIABLE: u8 = 0x07;
const CMD_SEND_FRAGMENT: u8 = 0x08;

const MSG_OP_REQUEST: u8 = 0x02;
const MSG_OP_RESPONSE: u8 = 0x03;
const MSG_EVENT: u8 = 0x04;
const MSG_INTERNAL_REQ: u8 = 0x06;
const MSG_INTERNAL_RES: u8 = 0x07;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PhotonMessage {
    Event {
        event_code: u8,
        parameters: BTreeMap<u8, PhotonValue>,
    },
    Request {
        operation_code: u8,
        parameters: BTreeMap<u8, PhotonValue>,
    },
    Response {
        operation_code: u8,
        return_code: u16,
        parameters: BTreeMap<u8, PhotonValue>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PhotonValue {
    Null,
    Bool(bool),
    Number(i64),
    Float(f64),
    String(String),
    Bytes(Vec<u8>),
    Array(Vec<PhotonValue>),
    Map(BTreeMap<String, PhotonValue>),
}

impl PhotonValue {
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            PhotonValue::Number(n) => Some(*n),
            PhotonValue::Bool(true) => Some(1),
            PhotonValue::Bool(false) => Some(0),
            PhotonValue::Float(f) => Some(*f as i64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            PhotonValue::Bool(b) => Some(*b),
            PhotonValue::Number(n) => Some(*n != 0),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            PhotonValue::String(s) => Some(s),
            _ => None,
        }
    }
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    fn check(&self, n: usize) -> Result<(), ()> {
        if self.remaining() < n {
            Err(())
        } else {
            Ok(())
        }
    }

    fn u8(&mut self) -> Result<u8, ()> {
        self.check(1)?;
        let v = self.buf[self.pos];
        self.pos += 1;
        Ok(v)
    }

    fn u16(&mut self) -> Result<u16, ()> {
        self.check(2)?;
        let v = u16::from_be_bytes([self.buf[self.pos], self.buf[self.pos + 1]]);
        self.pos += 2;
        Ok(v)
    }

    fn i16(&mut self) -> Result<i16, ()> {
        Ok(self.u16()? as i16)
    }

    fn u32(&mut self) -> Result<u32, ()> {
        self.check(4)?;
        let v = u32::from_be_bytes([
            self.buf[self.pos],
            self.buf[self.pos + 1],
            self.buf[self.pos + 2],
            self.buf[self.pos + 3],
        ]);
        self.pos += 4;
        Ok(v)
    }

    fn i32(&mut self) -> Result<i32, ()> {
        Ok(self.u32()? as i32)
    }

    fn i64(&mut self) -> Result<i64, ()> {
        self.check(8)?;
        let v = i64::from_be_bytes(self.buf[self.pos..self.pos + 8].try_into().map_err(|_| ())?);
        self.pos += 8;
        Ok(v)
    }

    fn f32(&mut self) -> Result<f32, ()> {
        self.check(4)?;
        let v = f32::from_be_bytes([
            self.buf[self.pos],
            self.buf[self.pos + 1],
            self.buf[self.pos + 2],
            self.buf[self.pos + 3],
        ]);
        self.pos += 4;
        Ok(v)
    }

    fn f64(&mut self) -> Result<f64, ()> {
        self.check(8)?;
        let v = f64::from_be_bytes(self.buf[self.pos..self.pos + 8].try_into().map_err(|_| ())?);
        self.pos += 8;
        Ok(v)
    }

    fn bytes(&mut self, n: usize) -> Result<&'a [u8], ()> {
        self.check(n)?;
        let slice = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn skip(&mut self, n: usize) -> Result<(), ()> {
        self.check(n)?;
        self.pos += n;
        Ok(())
    }
}

pub struct PhotonParser {
    fragments: HashMap<i32, FragmentBuf>,
}

struct FragmentBuf {
    total: i32,
    written: i32,
    payload: Vec<u8>,
}

impl PhotonParser {
    pub fn new() -> Self {
        Self {
            fragments: HashMap::new(),
        }
    }

    pub fn handle_udp(&mut self, packet: &[u8]) -> Vec<PhotonMessage> {
        let mut out = Vec::new();
        if packet.len() < PHOTON_HEADER {
            return out;
        }
        let mut r = Reader::new(packet);
        let _peer = r.u16().ok();
        let flags = match r.u8() {
            Ok(f) => f,
            Err(_) => return out,
        };
        let command_count = match r.u8() {
            Ok(c) => c,
            Err(_) => return out,
        };
        let _ts = r.u32().ok();
        let _challenge = r.i32().ok();

        // Encrypted Photon payloads are skipped.
        if flags == 1 {
            return out;
        }
        // CRC-enabled packets: skip (same strategy as public loot loggers).
        if flags == 0xCC {
            return out;
        }

        for _ in 0..command_count {
            if r.remaining() < COMMAND_HEADER {
                break;
            }
            let command_type = match r.u8() {
                Ok(v) => v,
                Err(_) => break,
            };
            let _channel = r.u8().ok();
            let _cflags = r.u8().ok();
            let _reserved = r.u8().ok();
            let mut command_len = match r.i32() {
                Ok(v) => v as i64 - COMMAND_HEADER as i64,
                Err(_) => break,
            };
            let _seq = r.i32().ok();

            if command_len < 0 {
                break;
            }
            if r.remaining() < command_len as usize {
                break;
            }

            match command_type {
                CMD_DISCONNECT => return out,
                CMD_SEND_UNRELIABLE => {
                    if command_len < 4 {
                        let _ = r.skip(command_len as usize);
                        continue;
                    }
                    let _ = r.skip(4);
                    command_len -= 4;
                    if let Ok(payload) = r.bytes(command_len as usize) {
                        self.decode_reliable(payload, &mut out);
                    }
                }
                CMD_SEND_RELIABLE => {
                    if let Ok(payload) = r.bytes(command_len as usize) {
                        self.decode_reliable(payload, &mut out);
                    }
                }
                CMD_SEND_FRAGMENT => {
                    if let Ok(payload) = r.bytes(command_len as usize) {
                        if let Some(complete) = self.handle_fragment(payload, command_len as usize) {
                            self.decode_reliable(&complete, &mut out);
                        }
                    }
                }
                _ => {
                    let _ = r.skip(command_len as usize);
                }
            }
        }
        out
    }

    fn handle_fragment(&mut self, buffer: &[u8], fragment_len: usize) -> Option<Vec<u8>> {
        if buffer.len() < FRAGMENT_HEADER {
            return None;
        }
        let mut r = Reader::new(buffer);
        let sequence = r.i32().ok()?;
        let _count = r.i32().ok()?;
        let _number = r.i32().ok()?;
        let total = r.i32().ok()?;
        let offset = r.i32().ok()?;
        let data_len = fragment_len.saturating_sub(FRAGMENT_HEADER);
        let data = r.bytes(data_len).ok()?;
        if total <= 0 || total > 2_000_000 {
            return None;
        }
        let entry = self.fragments.entry(sequence).or_insert_with(|| FragmentBuf {
            total,
            written: 0,
            payload: vec![0u8; total as usize],
        });
        let start = offset as usize;
        if start + data.len() <= entry.payload.len() {
            entry.payload[start..start + data.len()].copy_from_slice(data);
            entry.written += data.len() as i32;
        }
        if entry.written >= entry.total {
            let complete = entry.payload.clone();
            self.fragments.remove(&sequence);
            return Some(complete);
        }
        None
    }

    fn decode_reliable(&self, buffer: &[u8], out: &mut Vec<PhotonMessage>) {
        if buffer.len() < 2 {
            return;
        }
        let mut r = Reader::new(buffer);
        let flag = match r.u8() {
            Ok(v) => v,
            Err(_) => return,
        };
        if flag != 243 && flag != 253 {
            return;
        }
        let message_type = match r.u8() {
            Ok(v) => v,
            Err(_) => return,
        };
        if message_type > 128 {
            return;
        }
        let rest = &buffer[r.pos..];
        if let Some(msg) = decode_message(message_type, rest) {
            out.push(msg);
        }
    }
}

fn decode_message(message_type: u8, rest: &[u8]) -> Option<PhotonMessage> {
    match decode_p16(message_type, rest) {
        Ok(msg) => Some(msg),
        Err(_) => decode_p18(message_type, rest).ok(),
    }
}

fn decode_p16(message_type: u8, rest: &[u8]) -> Result<PhotonMessage, ()> {
    let mut r = Reader::new(rest);
    match message_type {
        MSG_EVENT => {
            let event_code = r.u8()?;
            let parameters = read_param_table_p16(&mut r)?;
            Ok(PhotonMessage::Event {
                event_code,
                parameters,
            })
        }
        MSG_OP_REQUEST | MSG_INTERNAL_REQ => {
            let operation_code = r.u8()?;
            let parameters = read_param_table_p16(&mut r)?;
            Ok(PhotonMessage::Request {
                operation_code,
                parameters,
            })
        }
        MSG_OP_RESPONSE | MSG_INTERNAL_RES => {
            let operation_code = r.u8()?;
            let return_code = r.u16()?;
            let dbg_type = r.u8()?;
            let _ = read_param_p16(dbg_type, &mut r);
            let parameters = read_param_table_p16(&mut r)?;
            Ok(PhotonMessage::Response {
                operation_code,
                return_code,
                parameters,
            })
        }
        _ => Err(()),
    }
}

fn read_param_table_p16(r: &mut Reader<'_>) -> Result<BTreeMap<u8, PhotonValue>, ()> {
    let count = r.i16()?;
    if count < 0 || count > 512 {
        return Err(());
    }
    let mut map = BTreeMap::new();
    for _ in 0..count {
        let id = r.u8()?;
        let ty = r.u8()?;
        let value = read_param_p16(ty, r)?;
        map.insert(id, value);
    }
    Ok(map)
}

fn read_param_p16(ty: u8, r: &mut Reader<'_>) -> Result<PhotonValue, ()> {
    match ty {
        0x00 | 0x2A => Ok(PhotonValue::Null),
        0x6F => {
            let v = r.u8()?;
            Ok(PhotonValue::Bool(v != 0))
        }
        0x62 => Ok(PhotonValue::Number(r.u8()? as i64)),
        0x6B | 0x07 => Ok(PhotonValue::Number(r.u16()? as i64)),
        0x69 => Ok(PhotonValue::Number(r.i32()? as i64)),
        0x6C => Ok(PhotonValue::Number(r.i64()?)),
        0x66 => Ok(PhotonValue::Float(r.f32()? as f64)),
        0x64 => Ok(PhotonValue::Float(r.f64()?)),
        0x73 => {
            let len = r.u16()? as usize;
            let bytes = r.bytes(len)?;
            Ok(PhotonValue::String(
                String::from_utf8_lossy(bytes).into_owned(),
            ))
        }
        0x78 => {
            let size = r.u32()? as usize;
            if size > 1_000_000 {
                return Err(());
            }
            let bytes = r.bytes(size)?;
            Ok(PhotonValue::Bytes(bytes.to_vec()))
        }
        0x79 => {
            let len = r.u16()? as usize;
            let slice_type = r.u8()?;
            let mut arr = Vec::with_capacity(len.min(1024));
            for _ in 0..len {
                arr.push(read_param_p16(slice_type, r)?);
            }
            Ok(PhotonValue::Array(arr))
        }
        0x7A => {
            let len = r.u16()? as usize;
            let mut arr = Vec::with_capacity(len.min(1024));
            for _ in 0..len {
                let t = r.u8()?;
                arr.push(read_param_p16(t, r)?);
            }
            Ok(PhotonValue::Array(arr))
        }
        0x61 => {
            let len = r.u16()? as usize;
            let mut arr = Vec::with_capacity(len.min(1024));
            for _ in 0..len {
                arr.push(read_param_p16(0x73, r)?);
            }
            Ok(PhotonValue::Array(arr))
        }
        0x6E => {
            let len = r.u32()? as usize;
            if len > 50_000 {
                return Err(());
            }
            let mut arr = Vec::with_capacity(len.min(1024));
            for _ in 0..len {
                arr.push(PhotonValue::Number(r.i32()? as i64));
            }
            Ok(PhotonValue::Array(arr))
        }
        0x44 => {
            let key_t = r.u8()?;
            let val_t = r.u8()?;
            let len = r.u16()? as usize;
            let mut map = BTreeMap::new();
            for _ in 0..len {
                let k = read_param_p16(key_t, r)?;
                let v = read_param_p16(val_t, r)?;
                map.insert(value_key(&k), v);
            }
            Ok(PhotonValue::Map(map))
        }
        0x68 => {
            let count = r.i16()?;
            if count < 0 || count > 1024 {
                return Err(());
            }
            let mut map = BTreeMap::new();
            for _ in 0..count {
                let kt = r.u8()?;
                let k = read_param_p16(kt, r)?;
                let vt = r.u8()?;
                let v = read_param_p16(vt, r)?;
                map.insert(value_key(&k), v);
            }
            Ok(PhotonValue::Map(map))
        }
        0x63 => {
            let _custom = r.u8()?;
            let len = r.u16()? as usize;
            let _ = r.bytes(len)?;
            Ok(PhotonValue::Null)
        }
        _ => Err(()),
    }
}

fn value_key(v: &PhotonValue) -> String {
    match v {
        PhotonValue::String(s) => s.clone(),
        PhotonValue::Number(n) => n.to_string(),
        PhotonValue::Bool(b) => b.to_string(),
        _ => "_".into(),
    }
}

// --- Protocol 18 (used after some Albion patches) ---

fn decode_p18(message_type: u8, rest: &[u8]) -> Result<PhotonMessage, ()> {
    let mut r = Reader::new(rest);
    match message_type {
        MSG_EVENT => {
            let event_code = r.u8()?;
            let parameters = read_param_table_p18(&mut r)?;
            Ok(PhotonMessage::Event {
                event_code,
                parameters,
            })
        }
        MSG_OP_REQUEST | MSG_INTERNAL_REQ => {
            let operation_code = r.u8()?;
            let parameters = read_param_table_p18(&mut r)?;
            Ok(PhotonMessage::Request {
                operation_code,
                parameters,
            })
        }
        MSG_OP_RESPONSE | MSG_INTERNAL_RES => {
            let operation_code = r.u8()?;
            let return_code = read_compressed_short(&mut r)?;
            let dbg_type = r.u8().unwrap_or(8);
            let _ = read_param_p18(dbg_type, &mut r);
            let parameters = read_param_table_p18(&mut r)?;
            Ok(PhotonMessage::Response {
                operation_code,
                return_code,
                parameters,
            })
        }
        _ => Err(()),
    }
}

fn read_param_table_p18(r: &mut Reader<'_>) -> Result<BTreeMap<u8, PhotonValue>, ()> {
    let count = r.u8()? as i16;
    if count < 0 || count > 512 {
        return Err(());
    }
    let mut map = BTreeMap::new();
    for _ in 0..count {
        let id = r.u8()?;
        let ty = r.u8()?;
        let value = read_param_p18(ty, r)?;
        map.insert(id, value);
    }
    Ok(map)
}

fn read_compressed_int(r: &mut Reader<'_>) -> Result<i32, ()> {
    let mut u = 0u32;
    let mut shift = 0;
    loop {
        let b = r.u8()?;
        u |= ((b & 0x7F) as u32) << shift;
        shift += 7;
        if b & 0x80 == 0 || shift > 28 {
            break;
        }
    }
    Ok(((u >> 1) as i32) ^ -((u & 1) as i32))
}

fn read_compressed_long(r: &mut Reader<'_>) -> Result<i64, ()> {
    let mut u = 0u64;
    let mut shift = 0;
    loop {
        let b = r.u8()?;
        u |= ((b & 0x7F) as u64) << shift;
        shift += 7;
        if b & 0x80 == 0 || shift > 63 {
            break;
        }
    }
    Ok(((u >> 1) as i64) ^ -((u & 1) as i64))
}

fn read_compressed_short(r: &mut Reader<'_>) -> Result<u16, ()> {
    Ok(read_compressed_int(r)?.max(0) as u16)
}

fn read_param_p18(ty: u8, r: &mut Reader<'_>) -> Result<PhotonValue, ()> {
    match ty {
        0 | 8 => Ok(PhotonValue::Null),
        2 => Ok(PhotonValue::Bool(false)),
        1 | 27 => Ok(PhotonValue::Bool(true)),
        26 => Ok(PhotonValue::Bool(false)),
        3 => Ok(PhotonValue::Number(r.u8()? as i64)),
        4 => Ok(PhotonValue::Number(r.i16()? as i64)),
        5 => Ok(PhotonValue::Float(r.f32()? as f64)),
        6 => Ok(PhotonValue::Float(r.f64()?)),
        7 => {
            let len = read_compressed_int(r)? as usize;
            if len > 50_000 {
                return Err(());
            }
            let bytes = r.bytes(len)?;
            Ok(PhotonValue::String(
                String::from_utf8_lossy(bytes).into_owned(),
            ))
        }
        9 => Ok(PhotonValue::Number(read_compressed_int(r)? as i64)),
        10 => Ok(PhotonValue::Number(read_compressed_long(r)?)),
        11 => Ok(PhotonValue::Number(r.u8()? as i64)),
        12 => Ok(PhotonValue::Number(-(r.u8()? as i64))),
        13 => Ok(PhotonValue::Number(r.u16()? as i64)),
        14 => Ok(PhotonValue::Number(-(r.u16()? as i64))),
        28 | 29 | 30 | 31 | 32 | 33 => Ok(PhotonValue::Number(0)),
        67 => {
            let len = read_compressed_int(r)? as usize;
            if len > 1_000_000 {
                return Err(());
            }
            let bytes = r.bytes(len)?;
            Ok(PhotonValue::Bytes(bytes.to_vec()))
        }
        21 => {
            let count = read_compressed_int(r)?;
            let mut map = BTreeMap::new();
            for _ in 0..count {
                let kt = r.u8()?;
                let k = read_param_p18(kt, r)?;
                let vt = r.u8()?;
                let v = read_param_p18(vt, r)?;
                map.insert(value_key(&k), v);
            }
            Ok(PhotonValue::Map(map))
        }
        23 | 64 => {
            let len = read_compressed_int(r)? as usize;
            let elem_t = r.u8()?;
            let mut arr = Vec::with_capacity(len.min(1024));
            for _ in 0..len {
                arr.push(read_param_p18(elem_t, r)?);
            }
            Ok(PhotonValue::Array(arr))
        }
        _ => {
            // Best-effort skip: unknown Protocol18 types abort this value.
            Err(())
        }
    }
}
