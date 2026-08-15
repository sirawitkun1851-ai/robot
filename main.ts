/**
 * iBIT Line Follower - เวอร์ชัน 8 เซนเซอร์ (เรียงแถวเดียวหน้าหุ่น)
 * บอร์ด: micro:bit + iBIT (INEX), มอเตอร์ 2000 RPM
 * เขียนใน MakeCode -> โหมด JavaScript
 *
 * TODO 3 จุดที่ต้องแก้ให้ตรงกับ block จริงในเครื่อง (มีคอมเมนต์กำกับ):
 *  1. readSensor(ch) -> เปลี่ยนเป็น block อ่าน analog ของ iBIT จริง
 *  2. คำสั่งสั่งมอเตอร์ในลูปหลัก -> iBIT.Spin(...)
 *  3. คำสั่งหยุดมอเตอร์ -> iBIT.MotorStop()
 */

// ---------- ตั้งค่าพื้นฐาน ----------
let baseSpeed = 35
let maxSpeed = 60
let Kp = 6          // ค่าเริ่มต้น ต้องจูนใหม่เพราะ error range เปลี่ยนไป (ดูคำอธิบายท้ายไฟล์)
let Kd = 3
let lastError = 0
let running = false

// ตำแหน่งถ่วงน้ำหนักของเซนเซอร์แต่ละตัว ซ้ายสุด -> ขวาสุด (ตัวที่ 0-7)
let weight: number[] = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]

// ค่า calibrate ต่อเซนเซอร์ (บางตัวอาจอ่านค่าไม่เท่ากันเป๊ะ ต้อง calibrate แยก)
let white: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
let black: number[] = [4095, 4095, 4095, 4095, 4095, 4095, 4095, 4095]
let raw: number[] = [0, 0, 0, 0, 0, 0, 0, 0]
let pct: number[] = [0, 0, 0, 0, 0, 0, 0, 0] // 0=ขาว, 100=ดำ หลัง normalize

// ---------- ฟังก์ชันอ่านเซนเซอร์ทีละช่อง (0-7) ----------
function readSensor(ch: number): number {
    // TODO: แทนที่ด้วย block จริง เช่น
    // if (ch == 0) return iBIT.readAnalog(ibitAnalog.ADC0)
    // if (ch == 1) return iBIT.readAnalog(ibitAnalog.ADC1)
    // ... ไปจนถึง ADC7
    return 0
}

function readAllSensors() {
    for (let i = 0; i < 8; i++) {
        raw[i] = readSensor(i)
    }
}

function normalize(value: number, whiteVal: number, blackVal: number): number {
    if (blackVal == whiteVal) return 0
    let p = ((value - whiteVal) * 100) / (blackVal - whiteVal)
    if (p < 0) p = 0
    if (p > 100) p = 100
    return p
}

function clamp(v: number, lo: number, hi: number): number {
    if (v < lo) return lo
    if (v > hi) return hi
    return v
}

// ---------- ปุ่ม A: Calibrate ทั้ง 8 ตัวพร้อมกัน ----------
// วิธีใช้: กดปุ่ม A แล้วเลื่อน/ไกวหุ่นให้เซนเซอร์ทุกตัวผ่านทั้งพื้นขาวและเส้นดำ ภายใน ~4 วิ
input.onButtonPressed(Button.A, function () {
    basic.showString("C")
    for (let i = 0; i < 8; i++) {
        white[i] = 0
        black[i] = 4095
    }
    let t0 = input.runningTime()
    while (input.runningTime() - t0 < 4000) {
        readAllSensors()
        for (let i = 0; i < 8; i++) {
            if (raw[i] > white[i]) white[i] = raw[i]
            if (raw[i] < black[i]) black[i] = raw[i]
        }
        basic.pause(10)
    }
    basic.showIcon(IconNames.Yes)
})

// ---------- ปุ่ม B: เริ่ม/หยุดวิ่ง ----------
input.onButtonPressed(Button.B, function () {
    running = !running
    if (!running) {
        // iBIT.MotorStop()
        basic.showIcon(IconNames.No)
    } else {
        basic.showIcon(IconNames.Yes)
    }
})

// ---------- คำนวณตำแหน่งเส้นแบบ Weighted Average ----------
// คืนค่า error: ลบ = เส้นอยู่ทางซ้าย, บวก = เส้นอยู่ทางขวา, null = หาเส้นไม่เจอเลย
function computeError(): number {
    let sumWeighted = 0
    let sumPct = 0
    for (let i = 0; i < 8; i++) {
        pct[i] = normalize(raw[i], white[i], black[i])
        sumWeighted += pct[i] * weight[i]
        sumPct += pct[i]
    }

    // ถ้าไม่มีตัวไหนเจอดำเลย (sumPct ต่ำมาก) แปลว่าเส้นหาย
    // เกณฑ์ 5 ปรับได้ตามความไวจริงของเซนเซอร์
    if (sumPct < 5) {
        return NaN // ใช้ NaN แทนสถานะ "หาเส้นไม่เจอ"
    }
    return sumWeighted / sumPct // ค่าจะอยู่ราวๆ -3.5 ถึง +3.5
}

// ---------- Loop หลัก ----------
basic.forever(function () {
    if (!running) return

    readAllSensors()
    let error = computeError()

    if (isNaN(error)) {
        // เส้นหาย (เช่น เจอทางแยก/จุดสีเขียวกว้าง/ข้ามเส้นเต็มความกว้าง)
        // ใช้ error ล่าสุดวิ่งต่อชั่วคราวแบบเดาทิศทาง แทนที่จะหยุดสนิท
        error = lastError
    }

    let derivative = error - lastError
    let correction = Kp * error + Kd * derivative
    lastError = error

    let speedL = baseSpeed + correction
    let speedR = baseSpeed - correction

    speedL = clamp(speedL, 0, maxSpeed)
    speedR = clamp(speedR, 0, maxSpeed)

    // TODO: แทนที่ด้วย block จริงของ iBIT เช่น
    // iBIT.Spin(ibitMotor.Left, ibitDir.Forward, speedL)
    // iBIT.Spin(ibitMotor.Right, ibitDir.Forward, speedR)

    basic.pause(15) // 8 เซนเซอร์อ่านนานกว่า 2 ตัว ควรวัด loop time จริงแล้วปรับเลขนี้
})

/**
 * คำอธิบายการจูนค่า (8-sensor):
 *
 * error range ตอนนี้คือ -3.5 ถึง +3.5 (ไม่ใช่ -100 ถึง 100 แบบเดิม)
 * ดังนั้น Kp/Kd ต้อง "แรงกว่าเดิมมาก" เมื่อเทียบเป็นตัวเลข
 * เริ่ม Kp=6, Kd=0 ก่อน ค่อยๆ เพิ่มทีละ 1-2 จนหุ่นเข้าโค้งได้แต่ไม่ส่าย
 * แล้วค่อยเติม Kd ทีละ 1 เพื่อลดอาการแกว่งตอนวิ่งตรง
 *
 * เกณฑ์ "เส้นหาย" (sumPct < 5) ควรทดสอบจริงแล้วปรับ เพราะขึ้นกับ
 * noise ของเซนเซอร์และสีพื้นสนามจริง ถ้าหลุดง่ายเกินให้ลดเกณฑ์ลง
 * ถ้าหุ่นไม่ยอมหยุดตอนเจอทางแยกจริงๆ ให้เพิ่มเกณฑ์ขึ้น
 */