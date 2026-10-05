const fs = require('fs');
const os = require('os');
const path = require('path');
const { readLinuxCpuTemperature } = require('../src/core/cpuTemperature');

describe('Linux CPU sensor selection', () => {
    let root;
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'minepanel-thermal-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
    const write = (relative, value) => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, String(value));
    };
    const zone = (number, type, value) => {
        write(`thermal/thermal_zone${number}/type`, type);
        write(`thermal/thermal_zone${number}/temp`, value);
    };
    const read = () => readLinuxCpuTemperature(path.join(root, 'thermal'), path.join(root, 'hwmon'));

    test.each([0, 3, 17])('Debian example selects x86 package at any zone number (%i)', number => {
        zone(101, 'acpitz', 16800);
        zone(102, 'acpitz', 27800);
        zone(103, 'pch_cannonlake', 34000);
        zone(104, 'cpu-thermal', 65000);
        zone(number, 'x86_pkg_temp', 47000);
        expect(read()).toBe(47);
    });
    test('selects hottest package at equal priority, independent of enumeration order', () => {
        zone(1, 'x86_pkg_temp', 49000);
        zone(20, 'x86_pkg_temp', 47000);
        zone(0, 'cpu-thermal', 90000);
        expect(read()).toBe(49);
    });
    test('ignores missing type/temp and malformed or sentinel readings; continues to valid CPU', () => {
        zone(0, 'x86_pkg_temp', '47000garbage');
        zone(1, 'x86_pkg_temp', -274000);
        zone(2, 'x86_pkg_temp', 999999999);
        write('thermal/thermal_zone3/type', 'x86_pkg_temp');
        write('thermal/thermal_zone4/temp', 40000);
        fs.mkdirSync(path.join(root, 'thermal/thermal_zone5/type'), { recursive: true });
        write('thermal/thermal_zone5/temp', 42000);
        zone(6, 'CPU-THERMAL\n', ' 42500\n');
        expect(read()).toBe(42.5);
    });
    test.each(['cpu-thermal', 'cpu_thermal', 'cpu0-thermal', 'k10temp'])('supports CPU thermal type %s', type => {
        zone(0, 'acpitz', 16800);
        zone(8, type, 51000);
        expect(read()).toBe(51);
    });
    test.each(['bcm2835_thermal', 'bcm2711_thermal', 'soc_thermal', 'soc-thermal'])('supports SoC fallback %s', type => {
        zone(0, 'gpu-thermal', 78000);
        zone(2, type, 45000);
        expect(read()).toBe(45);
    });
    test('ignores ACPI, chipset, GPU and unrecognized zones instead of guessing', () => {
        zone(0, 'acpitz', 16800);
        zone(1, 'pch_cannonlake', 34000);
        zone(2, 'gpu-thermal', 76000);
        zone(3, 'unknown', 47000);
        expect(read()).toBeNull();
    });
    test('unavailable sysfs returns null', () => { expect(read()).toBeNull(); });
    test.each([0, -10000])('supports physically valid zero/subzero readings (%i)', raw => {
        zone(0, 'x86_pkg_temp', raw);
        expect(read()).toBe(raw / 1000);
    });
    test('AMD hwmon prefers Tdie over Tctl and SoC; skips chipset driver', () => {
        zone(0, 'acpitz', 16800);
        zone(1, 'soc-thermal', 35000);
        write('hwmon/hwmon0/name', 'pch_cannonlake');
        write('hwmon/hwmon0/temp1_input', 95000);
        write('hwmon/hwmon2/name', 'k10temp');
        for (const [id, label, value] of [[1, 'Tctl', 67000], [2, 'Tdie', 47000], [3, 'SoC', 92000]]) {
            write(`hwmon/hwmon2/temp${id}_label`, label);
            write(`hwmon/hwmon2/temp${id}_input`, value);
        }
        expect(read()).toBe(47);
    });
    test('Intel hwmon prefers hottest package over core readings', () => {
        write('hwmon/hwmon7/name', 'coretemp');
        for (const [id, label, value] of [[1, 'Package id 0', 48000], [2, 'Core 0', 52000], [3, 'Package id 1', 51000]]) {
            write(`hwmon/hwmon7/temp${id}_label`, label);
            write(`hwmon/hwmon7/temp${id}_input`, value);
        }
        expect(read()).toBe(51);
    });
    test('unreadable CPU hwmon input does not hide valid unlabeled CPU input', () => {
        write('hwmon/hwmon0/name', 'zenpower');
        fs.mkdirSync(path.join(root, 'hwmon/hwmon0/temp1_input'));
        write('hwmon/hwmon0/temp2_input', 46000);
        expect(read()).toBe(46);
    });
});
