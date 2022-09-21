"use strict";
// ==UserScript==
// @name         HiBob Time Utilities
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @description  Utilities to make it easier to log time in HiBob
// @author       Funday Factory
// @match        https://app.hibob.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hibob.com
// @grant        none
// ==/UserScript==
class Api {
    static xhr(method, url, body) {
        return new Promise(resolve => {
            let xhr = new XMLHttpRequest();
            xhr.open(method, url);
            xhr.setRequestHeader("Accept", "application/json");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    let result;
                    try {
                        result = JSON.parse(xhr.responseText);
                    }
                    catch (_a) {
                        result = {
                            result: xhr.responseText
                        };
                    }
                    resolve({
                        status: xhr.status,
                        body: result
                    });
                }
            };
            xhr.send(JSON.stringify(body));
        });
    }
}
class Dates {
    static parse(str) {
        if (!str)
            return null;
        const split = str.split("T");
        if (split.length < 2)
            split.push("00:00");
        return new Date(split.join("T")).getTime();
    }
    static format(time, includeTimestamp) {
        if (!time)
            return "";
        const date = new Date(time);
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}${includeTimestamp ? `T${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}` : ""}`;
    }
    static formatHour(hours) {
        const hour = Math.floor(hours % 24);
        const minute = Math.round((hours - hour) * 60);
        return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
    static parseTimeTohours(time) {
        const split = time.split(":");
        return parseInt(split[0]) + parseInt(split[1]) / 60;
    }
}
class Numbers {
    static round(num, decimals) {
        return Math.round(num * (10 ** decimals)) / (10 ** decimals);
    }
    static floor(num, decimals) {
        return Math.floor(num * (10 ** decimals)) / (10 ** decimals);
    }
    static ceil(num, decimals) {
        return Math.ceil(num * (10 ** decimals)) / (10 ** decimals);
    }
}
class HiBob {
    static async submit(date, entries) {
        const data = entries.map(e => { var _a; return { start: Dates.format(date + e.startHour * 3600 * 1000, true), end: e.lengthHours ? Dates.format(date + (e.startHour + e.lengthHours) * 3600 * 1000, true) : undefined, reason: e.reasonId, comment: (_a = e.comment) !== null && _a !== void 0 ? _a : undefined }; });
        const dateStr = Dates.format(date, false);
        const userId = await this.getUserId();
        const result = await Api.xhr("POST", `https://app.hibob.com/api/attendance/employees/${userId}/attendance/entries?forDate=${dateStr}`, data);
    }
    static async timelogReasons() {
        const metadata = await this.metadata();
        return metadata.timeLogEntryReason.values.map(v => {
            return {
                id: v.serverId,
                name: v.value
            };
        });
    }
    static async attendance(sheet) {
        const result = await Api.xhr("GET", `https://app.hibob.com/api/employees/attendance/my/sheets/${sheet}`, {});
        return result.body;
    }
    static async sheets() {
        const userId = await this.getUserId();
        const result = await Api.xhr("GET", `https://app.hibob.com/api/employees/${userId}/timelog/attendance/sheets`, {});
        return result.body;
    }
    static async metadata() {
        const result = await Api.xhr("GET", "https://app.hibob.com/api/company/metadata/lists/?includeArchived=true", {});
        return result.body;
    }
    static async getUserId() {
        var _a;
        if (typeof this.userId !== "string") {
            await this.userInfo();
        }
        return (_a = this.userId) !== null && _a !== void 0 ? _a : "";
    }
    static async userInfo() {
        const result = await Api.xhr("GET", "https://app.hibob.com/api/user", {});
        this.userId = result.body.id;
        return result.body;
    }
}
class Utils {
    static wait(ms) {
        return new Promise(resolve => {
            window.setTimeout(() => resolve(), ms);
        });
    }
    static waitUntil(delegate) {
        return new Promise(resolve => {
            const handle = window.setInterval(() => {
                if (delegate()) {
                    resolve();
                    window.clearInterval(handle);
                }
            }, 1);
        });
    }
    static sum(arr) {
        let val = 0;
        for (let i = 0; i < arr.length; i++)
            val += arr[i];
        return val;
    }
}
class TimelogUI {
    constructor() {
        this.sheetDropdownOptions = [];
        this.sheetDates = [];
        this.reasons = [];
        window.timelog = this;
        this.addButton();
    }
    async addButton() {
        while (true) {
            const parent = document.querySelector("div.app-content > app-top-bar.app-top-bar > div.actions");
            if (!parent) {
                await Utils.wait(1);
                continue;
            }
            this.toggleButton = document.createElement("button");
            this.toggleButton.className = "tl-toggle-btn";
            this.toggleButton.textContent = "⏲️";
            this.toggleButton.onclick = () => this.toggleVisible();
            parent.appendChild(this.toggleButton);
            this.createUI();
            this.createModel();
            break;
        }
    }
    toggleVisible() {
        var _a;
        if (!this.timelogUIOuter)
            return;
        if (this.timelogUIOuter.style.display === "none") {
            this.timelogUIOuter.style.display = "block";
            document.body.style.overflow = "hidden";
            if (this.sheetContainer)
                this.sheetContainer.innerHTML = "";
            (_a = this.model) === null || _a === void 0 ? void 0 : _a.fetchSheets();
        }
        else {
            this.timelogUIOuter.style.display = "none";
            document.body.style.overflow = "initial";
        }
    }
    createUI() {
        const style = document.createElement("style");
        style.innerHTML =
            `
    .tl-toggle-btn
    {
        border: none;
        background: none;
        font-size: 2em;
    }
    .tl-close-btn
    {
        font-size: 2em;
        position: absolute;
        right: 5px;
    }
    .tl-ui
    {
        position: fixed;
        z-index: 1000;
        inset: 0px;
        background-color: white;
        overflow-y: scroll;
        padding: 10px;
    }        
    .tl-date
    {
        margin-top: 10px;
        padding: 10px;
        border: 1px solid gray;
        border-radius: 5px;
    }
    .tl-save-status, .tl-add-entry-btn
    {
        margin-left: 10px;
    }
    .tl-entry
    {
        margin-top: 5px;
    }
    .tl-entry > *
    {
        margin-left: 5px;
    }
    .tl-entry > input[type=number]
    {
        width: 50px;
    }
    .tl-entry > input[type=time]
    {
        width: 75px;
    }
    .tl-save-status
    {
        font-weight: bold;
    }
    .tl-sheet-select
    {
        margin-left: 5px;
    }
    .tl-date-label
    {
        font-weight: bold;
    }
    .tl-date-label.tl-date-label-weekend
    {
        font-weight: initial;
        font-style: italic;
        color: gray;
    }
    .tl-entry-reason 
    {
        padding: 3px;
    }
    .tl-remove-entry-btn
    {
        float: right;
    }
    .tl-week-seperator
    {
        border-bottom: 2px solid gray;
        margin-top: 25px;
        margin-bottom: 25px;
    }
    .tl-balance-label
    {
        margin: 5px;
    }
    .tl-ui-inner
    {
        display: table;
        margin-left: auto;
        margin-right: auto;
    }
    .tl-ui-inner, .tl-week-seperator, .tl-date
    {
        min-width: 650px;
    }
    .tl-entry-comment {
        margin-top: 5px;
        margin-bottom: 15px;
        width: 100%;
        display: none;
    }
    .tl-has-comment .tl-entry-comment
    {
        display: block;
    }
`;
        document.body.appendChild(style);
        this.timelogUIOuter = document.createElement("div");
        this.timelogUIOuter.className = "tl-ui";
        this.timelogUIOuter.style.display = "none";
        document.body.append(this.timelogUIOuter);
        this.timelogUIInner = document.createElement("div");
        this.timelogUIInner.className = "tl-ui-inner";
        this.timelogUIOuter.append(this.timelogUIInner);
        const closeButton = document.createElement("button");
        closeButton.className = "tl-close-btn";
        closeButton.textContent = "➖";
        closeButton.onclick = () => this.toggleVisible();
        this.timelogUIInner.appendChild(closeButton);
        const sheetDropdownLabel = document.createElement("span");
        sheetDropdownLabel.innerText = "Sheet:";
        this.timelogUIInner.appendChild(sheetDropdownLabel);
        this.sheetDropdown = document.createElement("select");
        this.sheetDropdown.className = "tl-sheet-select";
        this.sheetDropdown.onchange = () => this.onSelectedSheetChange();
        this.timelogUIInner.appendChild(this.sheetDropdown);
        this.saveStatus = document.createElement("span");
        this.saveStatus.className = "tl-save-status";
        this.timelogUIInner.append(this.saveStatus);
        this.balanceLabel = document.createElement("div");
        this.balanceLabel.innerText = "Balance: ";
        this.balanceLabel.className = "tl-balance-label";
        this.timelogUIInner.append(this.balanceLabel);
        this.sheetContainer = document.createElement("div");
        this.sheetContainer.className = "tl-sheet";
        this.timelogUIInner.appendChild(this.sheetContainer);
    }
    createModel() {
        if (this.model) {
            this.model.onDateUpdated.off(this.onDateUpdated, this);
            this.model.onReasonsUpdated.off(this.onReasonsUpdated, this);
            this.model.onSaveStatusUpdated.off(this.onSaveStatusUpdated, this);
            this.model.onSheetUpdated.off(this.onSheetUpdated, this);
            this.model.onSheetsUpdated.off(this.onSheetsUpdated, this);
        }
        this.model = new TimelogModel();
        this.model.onDateUpdated.on(this.onDateUpdated, this);
        this.model.onReasonsUpdated.on(this.onReasonsUpdated, this);
        this.model.onSaveStatusUpdated.on(this.onSaveStatusUpdated, this);
        this.model.onSheetUpdated.on(this.onSheetUpdated, this);
        this.model.onSheetsUpdated.on(this.onSheetsUpdated, this);
        this.model.initialize();
    }
    onDateUpdated(data) {
        var _a;
        if (this.selectedSheet === data.sheet && this.sheetContainer) {
            let container = this.sheetDates.find(d => d.date === data.date);
            if (!container) {
                container = { date: data.date, parent: document.createElement("div"), entries: [] };
                this.sheetDates.push(container);
                container.parent.className = "tl-date";
                this.sheetContainer.appendChild(container.parent);
                if (new Date(data.date.date).getDay() === 1) {
                    const weekSeperator = document.createElement("div");
                    weekSeperator.className = "tl-week-seperator";
                    this.sheetContainer.appendChild(weekSeperator);
                }
                const title = document.createElement("span");
                title.className = "tl-date-label";
                title.innerText = new Date(data.date.date).toDateString();
                if (data.date.weekend)
                    title.classList.add("tl-date-label-weekend");
                container.parent.append(title);
                if (!data.sheet.locked) {
                    const add = document.createElement("button");
                    add.innerText = "➕";
                    add.className = "tl-add-entry-btn";
                    add.onclick = () => { var _a; return (_a = this.model) === null || _a === void 0 ? void 0 : _a.newEntry(data.date); };
                    container.parent.append(add);
                }
            }
            for (const entry of data.date.entries) {
                let parent = container.entries.find(p => p.entry === entry);
                if (!parent) {
                    parent = {
                        entry,
                        parent: document.createElement("div"),
                        startHour: document.createElement("input"),
                        endHour: document.createElement("input"),
                        length: document.createElement("input"),
                        reason: document.createElement("select"),
                        comment: document.createElement("input"),
                        commentButton: document.createElement("button")
                    };
                    container.entries.push(parent);
                    parent.parent.className = "tl-entry";
                    container.parent.appendChild(parent.parent);
                    parent.startHour.type = "time";
                    parent.startHour.className = "tl-entry-start";
                    if (data.sheet.locked)
                        parent.startHour.disabled = true;
                    parent.startHour.onchange = () => {
                        var _a, _b, _c;
                        const end = entry.startHour + entry.lengthHours;
                        (_a = this.model) === null || _a === void 0 ? void 0 : _a.changeStartHour(data.date, data.date.entries.indexOf(entry), Dates.parseTimeTohours((_b = parent === null || parent === void 0 ? void 0 : parent.startHour.value) !== null && _b !== void 0 ? _b : "08:00"));
                        const length = Numbers.round(end - entry.startHour, 2);
                        (_c = this.model) === null || _c === void 0 ? void 0 : _c.changeLengthHours(data.date, data.date.entries.indexOf(entry), length);
                    };
                    parent.parent.appendChild(parent.startHour);
                    const endLabel = document.createElement("span");
                    endLabel.className = "tl-end-label";
                    endLabel.innerText = "-";
                    parent.parent.appendChild(endLabel);
                    parent.endHour.type = "time";
                    parent.endHour.className = "tl-entry-end";
                    if (data.sheet.locked)
                        parent.endHour.disabled = true;
                    parent.endHour.onchange = () => {
                        var _a;
                        if (parent === null || parent === void 0 ? void 0 : parent.endHour) {
                            const length = Numbers.round(Dates.parseTimeTohours(parent.endHour.value) - entry.startHour, 2);
                            (_a = this.model) === null || _a === void 0 ? void 0 : _a.changeLengthHours(data.date, data.date.entries.indexOf(entry), length);
                        }
                    };
                    parent.parent.appendChild(parent.endHour);
                    parent.reason.onchange = () => { var _a, _b; return (_a = this.model) === null || _a === void 0 ? void 0 : _a.changeReason(data.date, data.date.entries.indexOf(entry), (_b = parent === null || parent === void 0 ? void 0 : parent.reason.value) !== null && _b !== void 0 ? _b : ""); };
                    if (data.sheet.locked)
                        parent.reason.disabled = true;
                    parent.reason.className = "tl-entry-reason";
                    parent.parent.appendChild(parent.reason);
                    this.updateReasonsDropdown(parent.reason);
                    parent.length.type = "number";
                    parent.length.className = "tl-entry-length";
                    if (data.sheet.locked)
                        parent.length.disabled = true;
                    parent.length.onchange = () => {
                        var _a, _b;
                        (_a = this.model) === null || _a === void 0 ? void 0 : _a.changeLengthHours(data.date, data.date.entries.indexOf(entry), parseFloat((_b = parent === null || parent === void 0 ? void 0 : parent.length.value) !== null && _b !== void 0 ? _b : ""));
                    };
                    parent.parent.appendChild(parent.length);
                    const durationLabel = document.createElement("span");
                    durationLabel.className = "tl-duration-label";
                    durationLabel.innerText = "hour(s)";
                    parent.parent.appendChild(durationLabel);
                    if (!data.sheet.locked) {
                        parent.commentButton.innerText = "📝";
                        parent.commentButton.className = "tl-add-comment-btn";
                        parent.commentButton.onclick = () => { var _a; return (_a = this.model) === null || _a === void 0 ? void 0 : _a.toggleComment(data.date, data.date.entries.indexOf(entry)); };
                        parent.parent.appendChild(parent.commentButton);
                        const remove = document.createElement("button");
                        remove.innerText = "❌";
                        remove.className = "tl-remove-entry-btn";
                        remove.onclick = () => { var _a; return (_a = this.model) === null || _a === void 0 ? void 0 : _a.deleteEntry(data.date, data.date.entries.indexOf(entry)); };
                        parent.parent.appendChild(remove);
                    }
                    parent.comment.type = "text";
                    parent.comment.placeholder = "Write a note...";
                    parent.comment.title = "Write a note...";
                    parent.comment.className = "tl-entry-comment";
                    if (data.sheet.locked)
                        parent.comment.disabled = true;
                    parent.comment.onchange = () => {
                        var _a, _b;
                        (_a = this.model) === null || _a === void 0 ? void 0 : _a.changeComment(data.date, data.date.entries.indexOf(entry), (_b = parent === null || parent === void 0 ? void 0 : parent.comment.value) !== null && _b !== void 0 ? _b : "");
                    };
                    parent.parent.appendChild(parent.comment);
                }
                parent.startHour.value = Dates.formatHour(entry.startHour);
                parent.length.value = entry.lengthHours.toString();
                parent.endHour.value = Dates.formatHour(entry.startHour + entry.lengthHours);
                parent.reason.value = entry.reasonId;
                parent.comment.value = (_a = entry.comment) !== null && _a !== void 0 ? _a : "";
                parent.commentButton.title = entry.hasComment ? "Remove note" : "Add note";
                if (entry.hasComment)
                    parent.parent.classList.add("tl-has-comment");
                else
                    parent.parent.classList.remove("tl-has-comment");
            }
            for (const entry of container.entries) {
                if (!data.date.entries.find(e => e === entry.entry)) {
                    entry.parent.remove();
                }
            }
        }
        this.updateBalance();
    }
    updateReasonsDropdown(select) {
        select.innerHTML = "";
        for (const reason of this.reasons) {
            const option = document.createElement("option");
            option.value = reason.serverId;
            option.innerText = reason.value;
            select.appendChild(option);
        }
    }
    onReasonsUpdated(reasons) {
        this.reasons = reasons;
        for (const date of this.sheetDates) {
            for (const entry of date.entries) {
                this.updateReasonsDropdown(entry.reason);
            }
        }
    }
    onSaveStatusUpdated(status) {
        if (!this.saveStatus)
            return;
        if (status === TimelogSaveStatus.Saved)
            this.saveStatus.innerText = "✅ Saved";
        if (status === TimelogSaveStatus.Waiting)
            this.saveStatus.innerText = "⌛ Waiting...";
        if (status === TimelogSaveStatus.Saving)
            this.saveStatus.innerText = "🔃 Saving...";
    }
    onSheetUpdated(sheet) {
        if (this.sheetDropdown && !this.sheetDropdownOptions.find(s => s.sheet === sheet)) {
            const option = document.createElement("option");
            option.value = sheet.id.toString();
            option.innerText = `${new Date(sheet.start).toDateString()} - ${new Date(sheet.end).toDateString()}${sheet.locked ? " (locked)" : ""}`;
            this.sheetDropdownOptions.push({ sheet: sheet, element: option });
            this.sheetDropdown.appendChild(option);
        }
        if (this.selectedSheet === sheet) {
            if (this.sheetContainer)
                this.sheetContainer.innerHTML = "";
            this.sheetDates = [];
        }
        for (const date of sheet.dates) {
            this.onDateUpdated({ sheet, date });
        }
        this.updateBalance();
    }
    onSheetsUpdated(sheets) {
        if (this.sheetDropdown)
            this.sheetDropdown.innerHTML = "";
        this.sheetDropdownOptions = [];
        for (const sheet of sheets) {
            this.onSheetUpdated(sheet);
        }
        this.onSelectedSheetChange();
    }
    onSelectedSheetChange() {
        var _a;
        if (!this.sheetDropdown)
            return;
        if (this.sheetContainer)
            this.sheetContainer.innerHTML = "";
        this.sheetDates = [];
        const val = this.sheetDropdown.value;
        this.selectedSheet = (_a = this.sheetDropdownOptions.find(o => o.element.value === val)) === null || _a === void 0 ? void 0 : _a.sheet;
        if (this.selectedSheet && this.model) {
            this.model.fetchSheet(this.selectedSheet.id);
        }
    }
    async updateBalance() {
        var _a, _b, _c;
        if (!this.model || !this.balanceLabel)
            return;
        const balance = await this.model.getCurrentBalanceHours();
        const monthBalance = Numbers.round((_c = balance.sheets[(_b = (_a = this.selectedSheet) === null || _a === void 0 ? void 0 : _a.id.toString()) !== null && _b !== void 0 ? _b : ""]) !== null && _c !== void 0 ? _c : 0, 2);
        const totalBalance = Numbers.round(balance.balance, 2);
        this.balanceLabel.innerText = `Flex: ${totalBalance} hour${totalBalance != 1 ? "s" : ""} (current month: ${monthBalance} hour${monthBalance != 1 ? "s" : ""})`;
    }
}
var TimelogSaveStatus;
(function (TimelogSaveStatus) {
    TimelogSaveStatus[TimelogSaveStatus["Waiting"] = 0] = "Waiting";
    TimelogSaveStatus[TimelogSaveStatus["Saving"] = 1] = "Saving";
    TimelogSaveStatus[TimelogSaveStatus["Saved"] = 2] = "Saved";
})(TimelogSaveStatus || (TimelogSaveStatus = {}));
class EventHandler {
    constructor() {
        this.handlers = [];
    }
    on(handler, context) {
        this.handlers.push({ handler, context });
    }
    off(handler, context) {
        this.handlers = this.handlers.filter(h => h.handler !== handler || h.context !== context);
    }
    fire(val) {
        this.handlers.forEach(h => h.handler.call(h.context, val));
    }
}
class TimelogModel {
    constructor() {
        this.sheets = [];
        this.onDateUpdated = new EventHandler();
        this.onReasonsUpdated = new EventHandler();
        this.onSheetUpdated = new EventHandler();
        this.onSheetsUpdated = new EventHandler();
        this.onSaveStatusUpdated = new EventHandler();
        this.saveHandle = -1;
        this.saving = false;
        this.calculatingFlex = false;
        this.reasons = [];
    }
    initialize() {
        this.fetchSheets();
        this.fetchReasons();
        this.onSaveStatusUpdated.fire(TimelogSaveStatus.Saved);
    }
    async fetchSheets() {
        var _a, _b;
        this.sheets = [];
        const sheets = await HiBob.sheets();
        for (const sheet of sheets.employeeSheets) {
            const start = (_a = Dates.parse(sheet.cycleStartDate)) !== null && _a !== void 0 ? _a : 0;
            const end = (_b = Dates.parse(sheet.cycleEndDate)) !== null && _b !== void 0 ? _b : 0;
            const newSheet = {
                id: sheet.id,
                status: sheet.status,
                start,
                end,
                dates: [],
                locked: sheet.locked,
                hoursPerDay: 0
            };
            this.sheets.push(newSheet);
        }
        this.sheets.sort((a, b) => b.start - a.start);
        this.onSheetsUpdated.fire(this.sheets);
    }
    async fetchReasons() {
        this.reasons = (await HiBob.metadata()).timeLogEntryReason.values;
        this.onReasonsUpdated.fire(this.reasons);
    }
    async fetchSheet(id) {
        var _a;
        const sheet = this.sheets.find(s => s.id === id);
        if (!sheet)
            return;
        const attendance = await HiBob.attendance(id);
        sheet.hoursPerDay = attendance.summary.potentialWorkingHours / attendance.summary.potentialWorkingDays;
        sheet.dates = [];
        for (const date of attendance.attendance) {
            const time = (_a = Dates.parse(date.date)) !== null && _a !== void 0 ? _a : Date.now();
            const value = {
                dirty: false,
                date: time,
                weekend: [0, 6].includes(new Date(time).getDay()),
                entries: date.entries.map(e => {
                    var _a, _b, _c, _d, _e;
                    return {
                        startHour: Numbers.floor((((_a = Dates.parse(e.start)) !== null && _a !== void 0 ? _a : Date.now()) - ((_b = Dates.parse(date.date)) !== null && _b !== void 0 ? _b : Date.now())) / (3600 * 1000), 2),
                        lengthHours: Numbers.ceil((((_c = Dates.parse(e.end)) !== null && _c !== void 0 ? _c : Date.now()) - ((_d = Dates.parse(e.start)) !== null && _d !== void 0 ? _d : Date.now())) / (3600 * 1000), 2),
                        reasonId: e.reason,
                        comment: (_e = e.comment) !== null && _e !== void 0 ? _e : null,
                        hasComment: !!e.comment
                    };
                }).sort((a, b) => a.startHour - b.startHour)
            };
            sheet.dates.push(value);
        }
        sheet.dates.sort((a, b) => b.date - a.date);
        this.onSheetUpdated.fire(sheet);
    }
    changeStartHour(date, index, hour) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries[index].startHour = hour;
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    changeLengthHours(date, index, length) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries[index].lengthHours = length;
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    changeReason(date, index, reason) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries[index].reasonId = reason;
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    changeComment(date, index, comment) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries[index].comment = comment;
        date.entries[index].hasComment = true;
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    toggleComment(date, index) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries[index].hasComment = !date.entries[index].hasComment;
        date.entries[index].comment = date.entries[index].hasComment ? "" : null;
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    deleteEntry(date, index) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        date.entries.splice(index, 1);
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    async findLastEntry(originalDate) {
        const originalSheet = this.sheets.find(s => s.dates.some(d => d === originalDate));
        if (!originalSheet)
            return;
        let dateIndex = originalSheet.dates.indexOf(originalDate);
        let entryIndex = -1;
        for (let sheetIndex = this.sheets.indexOf(originalSheet); sheetIndex < this.sheets.length; sheetIndex++) {
            const sheet = this.sheets[sheetIndex];
            if (sheet.dates.length < 1)
                await this.fetchSheet(sheet.id);
            for (; dateIndex < sheet.dates.length; dateIndex++) {
                const date = sheet.dates[dateIndex];
                if (date.entries.length > 0)
                    return entryIndex < 0 ? date.entries[date.entries.length - 1] : date.entries[entryIndex];
                entryIndex = 0;
            }
            dateIndex = 0;
        }
    }
    async newEntry(date) {
        const sheet = this.sheets.find(s => s.dates.some(d => d === date));
        if (!sheet)
            return;
        const last = await this.findLastEntry(date);
        let startHour = 8.5;
        let lengthHours = 7.4;
        let reasonId = "";
        if (last) {
            if (date.entries.includes(last)) {
                startHour = last.startHour + last.lengthHours;
                lengthHours = 1;
            }
            else {
                startHour = last.startHour;
                lengthHours = last.lengthHours;
            }
            reasonId = last.reasonId;
        }
        date.entries.push({
            startHour,
            lengthHours,
            reasonId,
            comment: null,
            hasComment: false
        });
        date.dirty = true;
        this.queueSave();
        this.onDateUpdated.fire({ sheet, date });
    }
    queueSave() {
        window.clearTimeout(this.saveHandle);
        this.saveHandle = window.setTimeout(() => this.save(), 500);
        this.onSaveStatusUpdated.fire(TimelogSaveStatus.Waiting);
    }
    async save() {
        await Utils.waitUntil(() => !this.saving);
        this.saving = true;
        this.onSaveStatusUpdated.fire(TimelogSaveStatus.Saving);
        for (const sheet of this.sheets) {
            for (const date of sheet.dates) {
                if (date.dirty) {
                    await HiBob.submit(date.date, date.entries);
                    date.dirty = false;
                }
            }
        }
        this.onSaveStatusUpdated.fire(TimelogSaveStatus.Saved);
        this.saving = false;
    }
    async getCurrentBalanceHours() {
        var _a;
        const sheets = {};
        let balance = 0;
        if (!!this.sheets) {
            await Utils.waitUntil(() => !this.calculatingFlex);
            this.calculatingFlex = true;
            for (let i = this.sheets.length - 1; i >= 0; i--) {
                const sheet = this.sheets[i];
                if (!sheet)
                    continue;
                const cacheKey = `tl_cached_hour_balance_${sheet.id}`;
                let sheetBalance = 0;
                if (sheet.locked && window.localStorage.getItem(cacheKey) !== null) {
                    sheetBalance = parseFloat((_a = window.localStorage.getItem(cacheKey)) !== null && _a !== void 0 ? _a : "0");
                }
                else {
                    if (sheet.dates.length < 1)
                        await this.fetchSheet(sheet.id);
                    let potentialHours = sheet.dates.filter(d => !d.weekend).length * sheet.hoursPerDay;
                    let workedHours = Utils.sum(sheet.dates.map(d => Utils.sum(d.entries.map(e => e.lengthHours))));
                    if (workedHours > 0) {
                        sheetBalance -= potentialHours;
                        sheetBalance += workedHours;
                    }
                    if (sheet.locked && sheet.id > 0)
                        window.localStorage.setItem(cacheKey, sheetBalance.toString());
                }
                balance += sheetBalance;
                sheets[sheet.id.toString()] = sheetBalance;
            }
            this.calculatingFlex = false;
        }
        return { sheets, balance };
    }
}
new TimelogUI();
class ReasonEnhancements {
    constructor() {
        this.submitting = false;
        this.createUI();
        this.clockInButtonFinder();
    }
    createUI() {
        const style = document.createElement("style");
        style.innerHTML =
            `
    .re-label
    {
        color: white;
        font-size: 1.5em;
        margin-bottom: 10px;
        font-weight: bold;
    }
    .re-reason-select
    {
        padding: 5px;
    }
    .re-reason-ui
    {
        z-index: 2000;
        position: fixed;
        inset: 0;
        background-color: rgba(0,0,0,0.75);
        padding-top: 45vh;
        text-align: center;
    }
    .re-btn
    {
        padding: 0 var(--button-padding-x, 15px);
        min-width: 80px;
        height: var(--button-size, 30px);
        font-weight: 600;
        font-size: var(--button-font-size, 12px);
        font-family: var(--body-font-family);
        border: 0;
        border-radius: 4px;
        margin: 5px;
    }
    .re-btn.re-primary
    {
        color: var(--primary-bg-text-color, white);
        background-color: var(--primary-600);
    }
    .re-btn.re-secondary
    {
        color: var(--secondary-bg-text-color, #535353);
        background-color: var(--secondary-600);
    }
    .re-blur
    {
        filter: blur(2px);
    }
    .re-submitting .re-btn
    {
        display: none;
    }
`;
        document.body.append(style);
        this.reasonEnhancementUI = document.createElement("div");
        this.reasonEnhancementUI.className = "re-reason-ui";
        this.reasonEnhancementUI.style.display = "none";
        document.body.appendChild(this.reasonEnhancementUI);
        const label = document.createElement("div");
        label.innerText = "Choose Default Reason";
        label.className = "re-label";
        this.reasonEnhancementUI.appendChild(label);
        this.reasonSelect = document.createElement("select");
        this.reasonSelect.className = "re-reason-select";
        this.reasonSelect.onchange = () => this.saveDefaultReasonValue();
        this.reasonEnhancementUI.appendChild(this.reasonSelect);
        this.reasonEnhancementUI.appendChild(document.createElement("br"));
        const submitButton = document.createElement("button");
        submitButton.className = "re-submit-btn re-btn re-primary";
        submitButton.innerText = "Submit";
        submitButton.onclick = () => this.submit();
        this.reasonEnhancementUI.appendChild(submitButton);
        const cancelButton = document.createElement("button");
        cancelButton.className = "re-cancel-btn re-btn re-secondary";
        cancelButton.innerText = "Cancel";
        cancelButton.onclick = () => this.cancel();
        this.reasonEnhancementUI.appendChild(cancelButton);
    }
    async clockInButtonFinder() {
        var _a;
        while (true) {
            const buttons = document.querySelectorAll("b-button.punch-clock-button, b-button.time-widget-clock-in-btn, b-button.time-widget-clock-out-btn, b-button.quick-fix-apply-button");
            for (const button of buttons) {
                if (!button.classList.contains("re-enhanced")) {
                    button.classList.add("re-enhanced");
                    this.enhanceClockInButton(button);
                }
            }
            if (!this.appRoot) {
                this.appRoot = (_a = document.querySelector("app-root")) !== null && _a !== void 0 ? _a : undefined;
            }
            await Utils.wait(10);
        }
    }
    enhanceClockInButton(button) {
        button.addEventListener("click", () => this.showReasonFixer());
    }
    saveDefaultReasonValue() {
        if (!this.reasonSelect)
            return;
        window.localStorage.setItem("re-last-reason", this.reasonSelect.value);
    }
    loadDefaultReasonValue() {
        var _a;
        if (!this.reasonSelect)
            return;
        this.reasonSelect.value = (_a = window.localStorage.getItem("re-last-reason")) !== null && _a !== void 0 ? _a : "";
    }
    async showReasonFixer() {
        if (!this.reasonEnhancementUI)
            return;
        await Utils.wait(250);
        this.setUIVisible(true);
        if (this.reasonSelect) {
            const reasons = await HiBob.metadata();
            this.reasonSelect.innerHTML = "";
            for (const reason of reasons.timeLogEntryReason.values) {
                const option = document.createElement("option");
                option.value = reason.serverId;
                option.innerText = reason.value;
                this.reasonSelect.appendChild(option);
            }
            this.loadDefaultReasonValue();
        }
    }
    cancel() {
        this.setUIVisible(false);
    }
    setUIVisible(value) {
        if (this.reasonEnhancementUI) {
            if (value)
                this.reasonEnhancementUI.style.display = "block";
            else
                this.reasonEnhancementUI.style.display = "none";
        }
        if (this.appRoot) {
            if (value)
                this.appRoot.classList.add("re-blur");
            else
                this.appRoot.classList.remove("re-blur");
        }
    }
    async submit() {
        var _a, _b;
        await Utils.waitUntil(() => !this.submitting);
        if (!this.reasonSelect)
            return;
        const reason = this.reasonSelect.value;
        this.submitting = true;
        (_a = this.reasonEnhancementUI) === null || _a === void 0 ? void 0 : _a.classList.add("re-submitting");
        const sheets = await HiBob.sheets();
        for (const sheet of sheets.employeeSheets) {
            if (sheet.locked)
                continue;
            const attendance = await HiBob.attendance(sheet.id);
            for (const date of attendance.attendance) {
                if (date.entries.some(e => !e.reason)) {
                    const time = Dates.parse(date.date);
                    if (typeof time !== "number")
                        continue;
                    const entries = date.entries.map(e => {
                        var _a, _b, _c, _d;
                        return {
                            startHour: (((_a = Dates.parse(e.start)) !== null && _a !== void 0 ? _a : Date.now()) - time) / (3600 * 1000),
                            lengthHours: e.end ? (((_b = Dates.parse(e.end)) !== null && _b !== void 0 ? _b : Date.now()) - ((_c = Dates.parse(e.start)) !== null && _c !== void 0 ? _c : Date.now())) / (3600 * 1000) : null,
                            reasonId: e.reason || reason,
                            comment: (_d = e.comment) !== null && _d !== void 0 ? _d : null
                        };
                    });
                    await HiBob.submit(time, entries);
                }
            }
        }
        this.setUIVisible(false);
        (_b = this.reasonEnhancementUI) === null || _b === void 0 ? void 0 : _b.classList.remove("re-submitting");
        this.submitting = false;
    }
}
new ReasonEnhancements();
