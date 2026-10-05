"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLinuxCpuTemperature = readLinuxCpuTemperature;
const fs = require("fs");
const path = require("path");
function entries(directory) {
    try {
        return fs.readdirSync(directory);
    }
    catch (_) {
        return [];
    }
}
function read(file) {
    try {
        return fs.readFileSync(file, 'utf8').trim().toLowerCase();
    }
    catch (_) {
        return null;
    }
}
function temperature(file) {
    const raw = read(file);
    if (raw === null || !/^-?\d+$/.test(raw))
        return null;
    const value = Number(raw) / 1000;
    // Reject broken/sentinel readings, without rejecting valid zero/subzero CPUs.
    return Number.isFinite(value) && value >= -40 && value <= 150 ? value : null;
}
function select(readings) {
    if (!readings.length)
        return null;
    const priority = Math.min(...readings.map(r => r.priority));
    // Multiple packages/cores: use the hottest equally preferred sensor.
    return Math.max(...readings.filter(r => r.priority === priority).map(r => r.temperature));
}
/** CPU temperature only: unknown ACPI, chipset and GPU zones are not CPU fallbacks. */
function readLinuxCpuTemperature(thermalRoot = '/sys/class/thermal', hwmonRoot = '/sys/class/hwmon') {
    const cpu = [];
    const soc = [];
    for (const zone of entries(thermalRoot).filter(name => /^thermal_zone\d+$/.test(name))) {
        const type = read(path.join(thermalRoot, zone, 'type'));
        const value = temperature(path.join(thermalRoot, zone, 'temp'));
        if (type === null || value === null)
            continue;
        if (type === 'x86_pkg_temp')
            cpu.push({ priority: 0, temperature: value });
        else if (['coretemp', 'k10temp', 'zenpower'].includes(type))
            cpu.push({ priority: 1, temperature: value });
        else if (/^cpu\d*(?:[-_].*)?$/.test(type))
            cpu.push({ priority: 2, temperature: value });
        else if (['soc_thermal', 'soc-thermal', 'bcm2835_thermal', 'bcm2711_thermal'].includes(type))
            soc.push({ priority: 0, temperature: value });
    }
    const thermal = select(cpu);
    if (thermal !== null)
        return thermal;
    // AMD and some Intel systems expose CPU sensors only through hwmon.
    const hwmon = [];
    for (const chip of entries(hwmonRoot).filter(name => /^hwmon\d+$/.test(name))) {
        const directory = path.join(hwmonRoot, chip);
        const driver = read(path.join(directory, 'name'));
        if (!driver || !['coretemp', 'k10temp', 'zenpower', 'cpu_thermal', 'cpu-thermal'].includes(driver))
            continue;
        for (const input of entries(directory).filter(name => /^temp\d+_input$/.test(name))) {
            const value = temperature(path.join(directory, input));
            if (value === null)
                continue;
            const label = read(path.join(directory, input.replace('_input', '_label')));
            let priority;
            if (label && (/^package id \d+$/.test(label) || label === 'tdie'))
                priority = 0;
            else if (label === 'tctl')
                priority = 1;
            else if (label && /^(?:core \d+|cpu\d*)$/.test(label))
                priority = 2;
            else if (!label)
                priority = 3; // Known CPU driver with no labels.
            else
                continue; // e.g. AMD SoC/CCD readings, rather than package temperature.
            hwmon.push({ priority, temperature: value });
        }
    }
    return select(hwmon) ?? select(soc);
}
//# sourceMappingURL=cpuTemperature.js.map