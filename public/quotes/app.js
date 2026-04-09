// =======================
// ACCOUNT CONTEXT (SINGLE SOURCE OF TRUTH)
// =======================
const params = new URLSearchParams(window.location.search);
const ACCOUNT_ID = params.get("objectid");
let policyMortgageOptions = [];

if (!ACCOUNT_ID) {
    alert("❌ לא התקבל מזהה לקוח (objectid)");
    throw new Error("Missing objectid in iframe URL");
}

console.log("✅ ACCOUNT ID:", ACCOUNT_ID);




for (const [k, v] of new URLSearchParams(window.location.search)) {
    console.log("PARAM:", k, v);
}

let familyMembers = [];
let ACCOUNT = null;

const SPLIT_PRODUCT_NAME = "בריאות ומחלות";


let categories = {}
let companies = []
function getObjectIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("objectid");
}

const accountId = getObjectIdFromUrl();
console.log("ACCOUNT ID FROM URL:", accountId);

// Api Functions
async function postRequest(path, body) {
    try {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("POST error:", error);
        throw error;
    }
}

async function getRequest(path) {
    try {
        const response = await fetch(path);
        return await response.json();
    } catch (error) {
        console.error("GET error:", error);
        throw error;
    }
}

async function get_account(account_id) {
    const response = await getRequest(`/get_account/${account_id}`);

    const account = response?.data?.Record;

    if (!account) {
        alert("לא נמצא לקוח ב-CRM");
        throw new Error("account not found");
    }

    // 🔥 מקור אמת – כל רשומת הלקוח
    ACCOUNT = {
        id: account.accountid,
        name: account.accountname,

        // 🎯 שדות שביקשת
        ownerId: account.pcfsystemfield274 || null,
        financialPlannerId: account.ownerid || null
    };

    // הצגה ב־UI
    document.getElementById("primary_insured_title_name").textContent =
        "תיק לקוח: " + ACCOUNT.name;

    console.log("ACCOUNT CONTEXT:", ACCOUNT);

    return ACCOUNT;
}

async function loadFamilyMembers(account_id) {
    const data = await postRequest("/get_familyMembers", { account_id });

    familyMembers = data.familyMembers.map(m => {
        let birthDate = null;

        // השרת מחזיר member_birthDate
        if (m.member_birthDate) {
            const d = new Date(m.member_birthDate);
            if (!isNaN(d)) {
                birthDate = d.toISOString();
            }
        }

        return {
            name: m.member_name,
            id: m.member_id,
            relation: m.member_relation,
            uid: m.member_uid,
            birthDate: birthDate,   // ⬅️ עכשיו ייכנס כמו שצריך
            fromCRM: true
        };
    });

    renderFamilyMembers(familyMembers);
}

function parseDDMMYYYYToSafeISO(dateStr) {
    // dateStr = "19-02-1990"
    const [dd, mm, yyyy] = dateStr.split("-").map(Number);

    // יוצרים תאריך ב-UTC בשעה 12:00 (אמצע היום)
    const utcDate = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));

    return utcDate.toISOString();
}

function removeFamilyMember(tempId) {
    familyMembers = familyMembers.filter(m => m.tempId !== tempId);
    renderFamilyMembers(familyMembers);
}

function renderFamilyMembers(members) {
    const tbody = document.getElementById("familyMembersBody");
    tbody.innerHTML = "";

    members.forEach(member => {
        const isFromCRM = member.fromCRM === true;

        // פורמט תאריך לידה לתצוגה DD-MM-YYYY
        let birthDateDisplay = "";
        if (member.birthDate) {
            const d = new Date(member.birthDate);
            if (!isNaN(d)) {
                const dd = String(d.getDate()).padStart(2, "0");
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const yyyy = d.getFullYear();
                birthDateDisplay = `${dd}-${mm}-${yyyy}`;
            }
        }

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>
                <input 
                    type="text" 
                    value="${member.name || ""}" 
                    readonly
                    class="locked-field"
                >
            </td>

            <td>
                <input 
                    type="text" 
                    value="${member.relation || ""}" 
                    readonly
                    class="locked-field"
                >
            </td>

            <td>
                <input 
                    type="text" 
                    value="${birthDateDisplay}" 
                    readonly
                    class="locked-field"
                    placeholder="DD-MM-YYYY"
                >
            </td>

            <td>
                <input 
                    type="text" 
                    value="${member.id || ""}" 
                    readonly
                    class="locked-field"
                >
            </td>

            <td style="text-align:center;">
                ${isFromCRM
                ? `<button class="btn-disabled" disabled>🗑️</button>`
                : `<button class="btn-delete" onclick="removeFamilyMember('${member.tempId}')">🗑️</button>`
            }
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function getProductByName(category, product_name) {
    let product;
    categories[category].products.forEach((_product) => {
        if (_product.name == product_name) {
            product = _product
        }
    })
    return product
}

function getCompanyId(company_name) {
    let company_id;
    companies.forEach((comp) => {
        if (comp.company_name === company_name) {
            company_id = comp.company_id
        }
    })
    return company_id
}

function displayCategories(categories) {
    const categorySelector = document.getElementById("categorySelector");
    const categories_list = Object.keys(categories);

    categories_list.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.id = categories[category].id;
        option.textContent = category;
        categorySelector.appendChild(option)
    })
}

function displayProducts(categories) {
    const productSelector = document.getElementById("productSelector")
    const categories_list = Object.keys(categories);

    categories_list.forEach(category => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = category;
        optgroup.className = "productSelectCategory";
        optgroup.id = category;

        // העתקת מערך המוצרים ומיון אלפביתי בעברית
        const products = [...categories[category].products].sort((a, b) =>
            a.name.localeCompare(b.name, 'he')
        );

        products.forEach(product => {
            const option = document.createElement("option");
            option.textContent = product.name;
            option.value = product.name + "|" + categories[category].type;
            optgroup.appendChild(option)
        });
        productSelector.appendChild(optgroup)
    })
}

function productCategoryReview() {
    const productSelect = document.getElementById("productSelector");
    productSelect.disabled = true;
    productSelect.value = "";
    document.getElementById("categorySelector").addEventListener("change", function () {
        productSelect.disabled = false;
    })
}

function getCompaniesForType(type) {

    return companies.filter(c => {

        const companyType = Number(c.company_type); // 1 / 2 / 3
        const isTransferOnly = Number(c.transfer_only) === 1;

        // ❌ גוף מעביר בלבד – לא חברה מנהלת
        if (isTransferOnly) {
            return false;
        }

        // ❌ בלי סיווג תקין
        if (![1, 2, 3].includes(companyType)) {
            return false;
        }

        // כרטיס ביטוחי
        if (type === "ins") {
            return companyType === 2 || companyType === 3;
        }

        // כרטיס פיננסי / פנסיוני
        if (type === "fin") {
            return companyType === 1 || companyType === 3;
        }

        return false;
    });
}

function getTransferCompanies() {
    return companies.filter(c => {
        const companyType = Number(c.company_type);
        // גוף מעביר = פיננסי או משולב בלבד
        return companyType === 1 || companyType === 3;
    });
}

function chooseCategory() {
    document.getElementById("categorySelector").addEventListener("change", function () {
        const selectedCategory = this.value;
        const productSelect = document.getElementById("productSelector");
        const groups = productSelect.querySelectorAll("optgroup");

        productSelect.selectedIndex = 0;

        groups.forEach(group => {
            if (group.id == selectedCategory) {
                group.style.display = "block";
            } else {
                group.style.display = "none"
            }
        })
    })
}

function updateHeader(input) {
    const card = input.closest('.card');

    const companySelect = card.querySelector('.inp-company');
    const insuredSelect = card.querySelector('.inp-insured');

    const companyText =
        companySelect?.selectedOptions?.[0]?.textContent || 'בחר חברה';

    const insuredText =
        insuredSelect?.selectedOptions?.[0]?.textContent || 'בחר מבוטח';

    const lblCompany = card.querySelector('.lbl-company');
    const lblInsured = card.querySelector('.lbl-insured');

    lblCompany.innerText = companyText;
    lblInsured.innerText = insuredText;

    // placeholder styling
    lblCompany.classList.toggle('hb-placeholder', !companySelect.value);
    lblInsured.classList.toggle('hb-placeholder', !insuredSelect.value);
}

function closeCard(cardId, event) {
    if (event) event.stopPropagation();

    const card = document.getElementById(cardId);
    if (card) {
        card.remove();
    }
}

function toggleMortgageField(card) {
    const productName = card
        .querySelector('.header-breadcrumb .hb-item')
        ?.textContent
        ?.trim();

    const wrapper = card.querySelector('.policy-pledger-wrapper');
    if (!wrapper) return;

    const shouldShow =
        productName === "ריסק משכנתא" ||
        productName === "ריסק משועבד";

    wrapper.style.display = shouldShow ? "block" : "none";

    // אם הסתרנו – ננקה ערך
    if (!shouldShow) {
        const select = wrapper.querySelector('select');
        if (select) select.value = "";
    }
}

function syncPrimaryInsuredWithTable(selectEl) {
    const card = selectEl.closest('.card');

    // שם המבוטח שנבחר (טקסט, לא value)
    const selectedName = selectEl.selectedOptions[0]?.textContent?.trim();
    if (!selectedName) return;

    const rows = card.querySelectorAll('tbody tr');

    rows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const rowName = row.querySelector('.name')?.value?.trim();

        if (!checkbox || !rowName) return;

        if (rowName === selectedName) {
            // ✅ מבוטח ראשי – תמיד בפנים
            checkbox.checked = true;
            checkbox.disabled = true;

            // מפעילים את כל השדות בשורה
            row.querySelectorAll('input, select').forEach(el => {
                if (el !== checkbox && !el.hasAttribute('readonly')) {
                    el.disabled = false;
                }
            });
        } else {
            // שאר המבוטחים
            checkbox.disabled = false;

            // אם לא מסומן – השדות כבויים
            if (!checkbox.checked) {
                row.querySelectorAll('input, select').forEach(el => {
                    if (el !== checkbox && !el.hasAttribute('readonly')) {
                        el.disabled = true;
                    }
                });
            }
        }
    });
}

function insuranceOfferTab(cardId, headerContent, productName) {

    const isHealthAndDiseases = productName === SPLIT_PRODUCT_NAME;

    // ===== כותרות פרמיה + סכום ביטוח =====
    const premiumAndAmountHeader = isHealthAndDiseases
        ? `
            <th>פרמיית בריאות</th>
            <th>פרמיית מחלות</th>
            <th>סכום ביטוח בריאות</th>
            <th>סכום ביטוח מחלות</th>
          `
        : `
            <th>פרמיה</th>
            <th>סכום ביטוח</th>
          `;

    // ===== תאי פרמיה + סכום ביטוח =====
    const premiumAndAmountCells = isHealthAndDiseases
        ? `
            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="premium-health" type="number" disabled>
                </div>
            </td>
            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="premium-disease" type="number" disabled>
                </div>
            </td>

            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="insurance-amount-health" type="number" disabled>
                </div>
            </td>
            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="insurance-amount-disease" type="number" disabled>
                </div>
            </td>
          `
        : `
            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="premium" type="number" disabled>
                </div>
            </td>

            <td>
                <div class="input-group">
                    <span class="currency-symbol">₪</span>
                    <input class="insurance_amount" type="number" disabled>
                </div>
            </td>
          `;

    // ===== כותרות הנחה =====
    const discountHeader = isHealthAndDiseases
        ? `
            <th>הנחת בריאות</th>
            <th>הנחת מחלות</th>
          `
        : `
            <th>הנחה</th>
          `;

    // ===== תאי הנחה =====
    const discountCells = isHealthAndDiseases
        ? `
            <td>
                <input class="discount-health" type="number" disabled>
            </td>
            <td>
                <input class="discount-disease" type="number" disabled>
            </td>
          `
        : `
            <td>
                <input class="discount" type="number" disabled>
            </td>
          `;

    const html = `
<div class="card theme-ins open" id="${cardId}" data-type="ins">
    <div class="card-header" onclick="toggleCard('${cardId}')">
        ${headerContent}
    </div>

    <div class="card-body">
        <div class="form-row">

            <!-- חברה מבטחת -->
            <div class="form-group">
                <label>חברה מבטחת</label>
                <select class="inp-company" onchange="updateHeader(this)">
                    <option value="" disabled selected>בחר...</option>
                    ${getCompaniesForType("ins").map(c => `
                    <option value="${c.company_id}">${c.company_name}</option>
                    `).join('')}

                </select>
            </div>

            <!-- מבוטח ראשי -->
            <div class="form-group">
                <label>מבוטח ראשי</label>
                <select class="inp-insured" onchange="updateHeader(this); syncPrimaryInsuredWithTable(this)">
                    <option value="" disabled selected>בחר...</option>
                    ${familyMembers.map(m => `
                    <option value="${m.name}">${m.name}</option>
                    `).join('')}
                </select>
            </div>
            <!-- משעבד (ריסק משכנתא / משועבד) -->
            <div class="form-group policy-pledger-wrapper" style="display:none;">
                <label>משעבד</label>
                <select class="policy_mortgage">
        <option value="" disabled selected>בחר משעבד</option>
                    ${(policyMortgageOptions || []).map(o => `
                        <option value="${o.value}">${o.label}</option>
                    `).join("")}
                </select>
            </div>



            <!-- סוג פעולה -->
            <div class="form-group">
                <label>סוג פעולה</label>
                <select class="insurance_action_type">
                    <option>מכירה</option>
                    <option>מינוי סוכן</option>
                </select>
            </div>

            <!-- סטטוס פוליסה -->
            <div class="form-group">
                <label>סטטוס</label>
                <select class="insurance_operation_status">
                    <option value="נשלח ליצרן" selected>נשלח ליצרן</option>
                    <option value="נשלח לעוצמה">נשלח לעוצמה</option>
                </select>
            </div>

            <div class="form-group">
                <label>הנחה (אוטומטי)</label>
                <input type="text" disabled placeholder="-" style="background:#f1f5f9;">
            </div>
        </div>

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 10px;">
            <div class="col-title">מבוטחים בפוליסה</div>

            <table id="table_ins_${cardId}">
                <thead>
                    <tr>
                        <th style="width:30px">✓</th>
                        <th>שם מבוטח</th>
                        <th>קשר משפחתי</th>
                        ${premiumAndAmountHeader}
                        ${discountHeader}
                    </tr>
                </thead>

                <tbody>
                    ${familyMembers.map(m => `
                    <tr data-name="${m.name}">
                        <td style="text-align:center">
                            <input type="checkbox" onchange="toggleRow(this)">
                        </td>

                        <td>
                            <input type="text" class="name" value="${m.name}" readonly>
                        </td>

                        <td>
                            <select class="role" disabled>
                                <option>${m.relation}</option>
                            </select>
                        </td>

                        ${premiumAndAmountCells}
                        ${discountCells}
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
</div>
`;

    return html;
}

function financeOfferTab(cardId, headerContent) {
    const html = `
        <div class="card theme-fin open" id="${cardId}" data-type="fin">
            <div class="card-header" onclick="toggleCard('${cardId}')">
                ${headerContent}
            </div>

            <div class="card-body">
                <div class="form-row">

                    <div class="form-group">
                        <label>חברה מנהלת</label>
                        <select class="inp-company" onchange="updateHeader(this)">
                            <option value="" disabled selected>בחר...</option>
                             ${getCompaniesForType("fin").map(c => `
                                <option value="${c.company_id}">${c.company_name}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>עבור מי הקופה</label>
                        <select class="inp-insured" onchange="updateHeader(this)">
                            <option value="" disabled selected>בחר...</option>
                            ${familyMembers.map(m => `
                                <option value="${m.name}">${m.name}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>מינוי סוכן / מכירה</label>
                        <select class="inp-agent">
                            <option>מכירה</option>
                            <option>מינוי סוכן</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>סטטוס</label>
                        <select class="finance_operational_status">
                            <option value="נשלח ליצרן" selected>נשלח ליצרן</option>
                            <option value="נשלח לעוצמה">נשלח לעוצמה</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>ד. ניהול צבירה</label>
                        <input class="accumulation-management"
                               type="number"
                               step="0.01"
                               value="0.5">
                    </div>

                    <!-- ד. ניהול מהפקדה – מוצג רק בפנסיה -->
                    <div class="form-group deposit-fee-wrapper" style="display:none;">
                        <label>ד. ניהול מהפקדה</label>
                        <input class="deposit-management-fee"
                               type="number"
                               step="0.01">
                    </div>
                </div>

                <div class="split-container">
                    <div class="split-col">
                        <div class="col-title">
                            <span>מעסיקים</span>
                            <button class="btn-text" onclick="addEmpRow('${cardId}')">+ הוסף מעסיק</button>
                        </div>

                        <table id="table_emp_${cardId}">
                            <thead>
                                <tr>
                                    <th style="width:90px">ח.פ</th>
                                    <th style="width:45%">שם מעסיק</th>
                                    <th style="width:120px">הפקדה</th>
                                    <th style="width:30px"></th>
                                </tr>
                            </thead>
                            <tbody class="empoloyers"></tbody>
                        </table>
                    </div>

                    <div class="split-col"
                         style="border-right:1px solid #e2e8f0; padding-right:10px; margin-right:10px;">
                        <div class="col-title">
                            <span>ניוד צפוי</span>
                            <button class="btn-text" onclick="addTransRow('${cardId}')">+ הוסף ניוד</button>
                        </div>

                        <table id="table_trans_${cardId}">
                            <thead>
                                <tr>
                                    <th style="width:60%">גוף מעביר</th>
                                    <th style="width:130px">ניוד צפוי</th>
                                    <th style="width:30px"></th>
                                </tr>
                            </thead>
                            <tbody class="expected_mobility"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    return html;
}

function getCategoryName(type) {
    let category_name = ""

    Object.entries(categories).forEach(([key, value]) => {
        if (value.type === type) {
            category_name = key
        }
    })

    return category_name
};

function addNewOffer() {
    const selector = document.getElementById('productSelector');
    const value = selector.value;
    if (!value) return alert("נא לבחור מוצר");

    const [productName, type] = value.split('|');
    const container = document.getElementById('offersContainer');
    const cardId = 'card_' + Date.now();

    // סגירת כרטיסים אחרים
    document.querySelectorAll('.card').forEach(c => c.classList.remove('open'));

    const category_name = getCategoryName(type);

    const headerContent = `
        <span class="badge">${category_name}</span>
        <div class="header-breadcrumb">
            <span class="hb-item">${productName}</span>
            <span class="hb-sep">›</span>
            <span class="hb-item lbl-company hb-placeholder">בחר חברה</span>
            <span class="hb-sep">›</span>
            <span class="hb-item lbl-insured hb-placeholder">בחר מבוטח</span>
        </div>
        <span class="toggle-icon">▼</span>
        <span class="close-button" onclick="closeCard('${cardId}', event)">X</span>
    `;

    let html = '';
    if (type === 'ins') {
        html = insuranceOfferTab(cardId, headerContent, productName);
    } else {
        html = financeOfferTab(cardId, headerContent);
    }

    container.insertAdjacentHTML('beforeend', html);

    // =========================
    // 🔥 טיפול ייעודי בפיננסי
    // =========================
    if (type === 'fin') {
        // שורות ברירת מחדל
        addEmpRow(cardId);
        addTransRow(cardId);

        // דמי ניהול מהפקדה – רק בפנסיה
        const card = document.getElementById(cardId);
        const depositWrapper = card.querySelector('.deposit-fee-wrapper');

        if (
            depositWrapper &&
            (productName === "פנסיה מקיפה" || productName === "פנסיה משלימה")
        ) {
            depositWrapper.style.display = "block";
        }
    }

    // =========================
    // 🔥 טיפול ייעודי בביטוח
    // =========================
    if (type === 'ins') {
        const card = document.getElementById(cardId);
        const pledgerWrapper = card.querySelector('.policy-pledger-wrapper');
        const pledgerSelect = card.querySelector('.policy_mortgage');

        const isMortgageRisk =
            productName === 'ריסק משכנתא' ||
            productName === 'ריסק משועבד';

        if (pledgerWrapper) {
            pledgerWrapper.style.display = isMortgageRisk ? 'block' : 'none';
        }

        // ניקוי ערך אם לא רלוונטי
        if (!isMortgageRisk && pledgerSelect) {
            pledgerSelect.value = '';
        }
    }

    // איפוס בחירה
    selector.value = "";
}

function toggleCard(id) {
    const current = document.getElementById(id);
    if (!current) return;

    const isOpen = current.classList.contains('open');

    document.querySelectorAll('.card').forEach(c => c.classList.remove('open'));

    if (!isOpen) {
        current.classList.add('open');
    }
}

function toggleRow(checkbox) {
    const row = checkbox.closest('tr');
    const inputs = row.querySelectorAll('input:not([type="checkbox"]):not([readonly]), select:not([disabled])');
    inputs.forEach(input => input.disabled = !checkbox.checked);
}

function copyDown(btn, colIndex) {
    const table = btn.closest('table');
    const rows = table.querySelectorAll('tbody tr');
    let sourceValue = "";
    // Get value from first row
    const firstInput = rows[0].querySelectorAll('td')[colIndex].querySelector('input');
    if (firstInput) sourceValue = firstInput.value;

    rows.forEach((row, i) => {
        if (i === 0) return;
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
            const targetInput = row.querySelectorAll('td')[colIndex].querySelector('input');
            if (targetInput) targetInput.value = sourceValue;
        }
    });
}

function addFamilyMember() {
    const name = document.getElementById('newMemName').value.trim();
    const role = document.getElementById('newMemRel').value;
    const id = document.getElementById('newMemID').value.trim();
    const birthDateRaw = document.getElementById('newMemBirthDate').value.trim(); // DD-MM-YYYY

    if (!name || !id || !role || !birthDateRaw) {
        alert("נא למלא את כל השדות");
        return;
    }

    // ✅ ולידציית תאריך קשיחה: DD-MM-YYYY עם טווחים אמיתיים
    const birthDateRegex =
        /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-(19|20)\d{2}$/;

    if (!birthDateRegex.test(birthDateRaw)) {
        alert("תאריך לידה חייב להיות בפורמט DD-MM-YYYY (לדוגמה: 23-02-1988)");
        return;
    }

    const newMember = {
        name,
        id,
        relation: role,
        birthDate: birthDateRaw, // 🔒 נשמר כ־string בלבד
        tempId: "tmp_" + Date.now(),
        fromCRM: false
    };

    familyMembers.push(newMember);
    renderFamilyMembers(familyMembers);

    // ניקוי שדות
    document.getElementById('newMemName').value = '';
    document.getElementById('newMemID').value = '';
    document.getElementById('newMemRel').value = '';
    document.getElementById('newMemBirthDate').value = '';
}

function addEmpRow(cardId) {
    const tbody = document.querySelector(`#table_emp_${cardId} tbody`);
    const tr = document.createElement('tr');
    const extraId = 'extra_' + Math.random().toString(36).substr(2, 5);
    tr.innerHTML = `<td style="vertical-align:top"><input class="p_c" type="text" placeholder="ח.פ" onblur="checkHP(this, '${extraId}')"></td><td><input class="employer_name" type="text" placeholder="שם מעסיק" class="name-field"><div id="${extraId}" class="extra-fields"><b>מעסיק חדש:</b><input type="text" placeholder="עיר" style="margin-bottom:3px;"><input type="text" placeholder="כתובת"></div></td><td style="vertical-align:top"><div class="input-group"><span class="currency-symbol">₪</span><input type="number" class="input-with-currency"></div></td><td class="btn-del" onclick="deleteRow(this)" style="vertical-align:top">×</td>`;
    tbody.appendChild(tr);
}

function addTransRow(cardId) {
    const tbody = document.querySelector(`#table_trans_${cardId} tbody`);
    const tr = document.createElement('tr');

    tr.innerHTML = `
        <td>
            <select class="transferring_company">
                <option value="" disabled selected>בחר גוף...</option>
                ${getTransferCompanies().map(c => `
                    <option>${c.company_name}</option>
                `).join('')}
            </select>
        </td>

        <td>
            <div class="input-group">
                <span class="currency-symbol">₪</span>
                <input type="number" class="fin_input_with_corrency input-with-currency">
            </div>
        </td>

        <td class="btn-del" onclick="deleteRow(this)">×</td>
    `;

    tbody.appendChild(tr);
}

function checkHP(input, extraId) {
    const row = input.closest('tr');
    const nameInput = row.querySelector('.name-field');
    const extraDiv = document.getElementById(extraId);
    if (input.value === '511234567') {
        nameInput.value = "אינטל אלקטרוניקה"; nameInput.disabled = true;
        extraDiv.classList.remove('visible'); input.classList.remove('input-new');
    } else if (input.value.length >= 9) {
        input.classList.add('input-new'); nameInput.value = ""; nameInput.disabled = false; nameInput.focus();
        extraDiv.classList.add('visible');
    }
}

function deleteRow(btn) {
    btn.closest('tr').remove();

}

function collectPolicyInsured(card) {
    const insuredList = [];

    const rows = card.querySelectorAll('tbody tr');
    const primaryUID = getPrimaryInsuredUID(card);

    const productName = card
        .querySelector('.header-breadcrumb .hb-item')
        ?.textContent
        ?.trim();

    const isHealthAndDiseases = productName === SPLIT_PRODUCT_NAME;

    for (let row of rows) {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const name = row.querySelector('.name')?.value?.trim();

        const member = familyMembers.find(m => (m.name || "").trim() === name);
        if (!member) continue;

        const isPrimary = member.uid === primaryUID;
        const isChecked = checkbox && checkbox.checked;

        // ⛔ אם לא מסומן וגם לא מבוטח ראשי – מדלגים
        if (!isChecked && !isPrimary) continue;

        // =========================
        // 🟢 מוצר רגיל (לא מפוצל)
        // =========================
        if (!isHealthAndDiseases) {

            const premium = row.querySelector('.premium')?.value;
            const insuranceAmount = row.querySelector('.insurance_amount')?.value;
            const discount = row.querySelector('.discount')?.value || null;

            if (!premium || Number(premium) <= 0) {
                throw new Error(`חסרה פרמיה עבור המבוטח: ${name}`);
            }

            if (!insuranceAmount || Number(insuranceAmount) <= 0) {
                throw new Error(`חסר סכום ביטוח עבור המבוטח: ${name}`);
            }

            insuredList.push({
                contactId: member.uid || null,
                premium: Number(premium),
                insuranceAmount: Number(insuranceAmount),
                discount,
                splitProductType: null
            });

            continue;
        }

        // =========================
        // 🟢 בריאות + מחלות (מפוצל)
        // =========================

        const premiumHealth = row.querySelector('.premium-health')?.value;
        const premiumDisease = row.querySelector('.premium-disease')?.value;

        const amountHealth = row.querySelector('.insurance-amount-health')?.value;
        const amountDisease = row.querySelector('.insurance-amount-disease')?.value;

        const discountHealth = row.querySelector('.discount-health')?.value || null;
        const discountDisease = row.querySelector('.discount-disease')?.value || null;

        // --- ולידציות בריאות ---
        if (!premiumHealth || Number(premiumHealth) <= 0) {
            throw new Error(`חסרה פרמיית בריאות עבור המבוטח: ${name}`);
        }

        if (!amountHealth || Number(amountHealth) <= 0) {
            throw new Error(`חסר סכום ביטוח בריאות עבור המבוטח: ${name}`);
        }

        // --- ולידציות מחלות ---
        if (!premiumDisease || Number(premiumDisease) <= 0) {
            throw new Error(`חסרה פרמיית מחלות עבור המבוטח: ${name}`);
        }

        if (!amountDisease || Number(amountDisease) <= 0) {
            throw new Error(`חסר סכום ביטוח מחלות עבור המבוטח: ${name}`);
        }

        // --- רשומת בריאות ---
        insuredList.push({
            contactId: member.uid,
            premium: Number(premiumHealth),
            insuranceAmount: Number(amountHealth),
            discount: discountHealth,
            splitProductType: "health"
        });

        // --- רשומת מחלות ---
        insuredList.push({
            contactId: member.uid,
            premium: Number(premiumDisease),
            insuranceAmount: Number(amountDisease),
            discount: discountDisease,
            splitProductType: "disease"
        });
    }

    // ⛔ אין מצב שאין אף מבוטח
    if (insuredList.length === 0) {
        throw new Error("חייב להיות לפחות מבוטח אחד בפוליסה");
    }

    return insuredList;
}

function getMainInsuredPolicyDiscount(card) {
    const productName = card
        .querySelector('.header-breadcrumb .hb-item')
        ?.textContent
        ?.trim();

    const isHealthAndDiseases = productName === SPLIT_PRODUCT_NAME;

    const primaryName = card.querySelector('.inp-insured')?.value?.trim();
    if (!primaryName) return null;

    const rows = card.querySelectorAll('tbody tr');

    for (let row of rows) {
        const rowName = row.querySelector('.name')?.value?.trim();
        if (rowName !== primaryName) continue;

        // 🟢 מוצר רגיל
        if (!isHealthAndDiseases) {
            const v = row.querySelector('.discount')?.value;
            if (!v) return null;

            return `${v}%`;
        }

        // 🟢 בריאות + מחלות
        const healthRaw = row.querySelector('.discount-health')?.value;
        const diseaseRaw = row.querySelector('.discount-disease')?.value;

        const parts = [];

        if (healthRaw) {
            parts.push(`בריאות ${healthRaw}%`);
        }

        if (diseaseRaw) {
            parts.push(`מחלות ${diseaseRaw}%`);
        }

        if (parts.length === 0) return null;

        // 🔥 4 רווחים בין החלקים
        return parts.join("    ");
    }

    return null;
}

function collectFinanceData(card) {

    // --- קריאות מה-UI ---
    const insuredName = card.querySelector('.inp-insured')?.value;
    const companyId = card.querySelector('.inp-company')?.value;
    const saleOrAgentText = card.querySelector('.inp-agent')?.value;
    const managementFee = card.querySelector('.accumulation-management')?.value;

    const operationalStatusText =
        card.querySelector('.finance_operational_status')?.value;

    const productName = card.querySelector('.hb-item')?.textContent?.trim();
    const depositFeeInput = card.querySelector('.deposit-management-fee');
    const depositFee = depositFeeInput?.value;

    const requiresDepositFee =
        productName === "פנסיה מקיפה" ||
        productName === "פנסיה משלימה";

    // --- ולידציות UI בלבד ---
    if (!companyId) {
        throw new Error("חובה לבחור חברה מנהלת");
    }

    if (!insuredName) {
        throw new Error("חובה לבחור מבוטח בפיננסי");
    }

    if (managementFee === "" || managementFee === null || Number(managementFee) < 0) {
        throw new Error("חובה להזין דמי ניהול מצבירה תקינים");
    }

    if (!saleOrAgentText) {
        throw new Error("חובה לבחור מכירה / מינוי סוכן");
    }

    if (!operationalStatusText) {
        throw new Error("חובה לבחור סטטוס להצעה פיננסית");
    }

    if (requiresDepositFee) {
        if (
            depositFee === "" ||
            depositFee === null ||
            Number(depositFee) < 0
        ) {
            throw new Error("חובה להזין דמי ניהול מהפקדה בפנסיה");
        }
    }

    // --- מיפוי מבוטח (בלי דרישת CRM ID) ---
    const member = familyMembers.find(m => (m.name || "").trim() === (insuredName || "").trim());
    if (!member) {
        throw new Error(`המבוטח "${insuredName}" לא נמצא ברשימת בני המשפחה`);
    }
    console.log("FINANCE SELECTED MEMBER:", member);

    // --- מיפוי מכירה / מינוי סוכן ---
    const saleOrAgentMap = {
        "מכירה": 1,
        "מינוי סוכן": 2
    };

    const saleOrAgentValue = saleOrAgentMap[saleOrAgentText];
    if (saleOrAgentValue === undefined) {
        throw new Error("ערך מכירה / מינוי סוכן לא חוקי");
    }

    // --- מיפוי סטטוס תפעולי פיננסי ---
    const operationalStatusMap = {
        "נשלח לעוצמה": 1,
        "נשלח ליצרן": 2
    };

    const operationalStatusValue =
        operationalStatusMap[operationalStatusText];

    if (operationalStatusValue === undefined) {
        throw new Error("סטטוס פיננסי לא חוקי");
    }

    // --- חזרה מסודרת (כמו בפוליסה) ---
    const result = {
        memberRef: member.uid,                 // ⬅️ הפניה לבן המשפחה
        memberIdNumber: member.id,
        companyId: companyId,
        managementFeeAccumulation: Number(managementFee),
        saleOrAgent: saleOrAgentValue,
        operationalStatus: operationalStatusValue
    };

    if (requiresDepositFee) {
        result.managementFeeDeposit = Number(depositFee);
    }

    return result;
}

function collectFinanceTransfers(card) {
    const transfers = [];

    card.querySelectorAll('.expected_mobility tr').forEach(row => {
        const companyName = row.querySelector('.transferring_company')?.value;
        const amount = row.querySelector('.fin_input_with_corrency')?.value;

        // דילוג על שורות ריקות
        if (!companyName || !amount || Number(amount) <= 0) {
            return;
        }

        const companyId = getCompanyId(companyName);
        if (!companyId) {
            alert(`לא נמצא גוף מעביר עבור: ${companyName}`);
            return;
        }

        transfers.push({
            companyId,
            amount: Number(amount)
        });
    });

    return transfers;
}

function collectFinanceEmployers(card) {
    const employers = [];

    card.querySelectorAll('.empoloyers tr').forEach(row => {

        const companyNumber = row.querySelector('.p_c')?.value?.trim();
        const name = row.querySelector('.employer_name')?.value?.trim();
        const deposit = row.querySelector('.input-with-currency')?.value;

        // שורה ריקה – מתעלמים
        if (!companyNumber && !name && !deposit) {
            return;
        }

        // ולידציות – בלי alert
        if (!companyNumber) {
            throw new Error("חובה להזין ח.פ למעסיק");
        }

        if (!name) {
            throw new Error("חובה להזין שם מעסיק");
        }

        if (!deposit || Number(deposit) <= 0) {
            throw new Error("חובה להזין הפקדה תקינה למעסיק");
        }

        employers.push({
            companyNumber,
            name,
            monthlyDeposit: Number(deposit)
        });
    });

    return employers;
}

function getRole(role) {
    if (role === "בן/בת זוג") {
        return "2"
    } else if (role === "ילד/ה") {
        return "3"
    } else if (role === "אחר") {
        return "4"
    }
}

function getActionTypeId(action_type) {
    if (action_type === "מכירה") {
        return "1";
    } else if (action_type === "מינוי סוכן") {
        return "2";
    }
    return null;
}

async function getOrCreateEmployer(employer) {

    // חיפוש לפי ח.פ
    const searchRes = await postRequest("/find/employer", {
        companyNumber: employer.companyNumber
    });

    const existing =
        searchRes?.data?.Data &&
            searchRes.data.Data.length > 0
            ? searchRes.data.Data[0]
            : null;

    if (existing) {
        return existing.customobject1018id;
    }

    // יצירה אם לא קיים
    const createRes = await postRequest("/create/employer", {
        name: employer.name,
        pcfCompanyNumber: employer.companyNumber
    });

    const employerId = createRes?.data?.Record?.customobject1018id;

    if (!employerId) {
        alert(`שגיאה ביצירת מעסיק: ${employer.name}`);
        throw new Error("employer creation failed");
    }

    return employerId;
}

async function saveFamilyMembers(account_id, btn) {

    function normalizeBirthDate(raw) {
        const v = (raw ?? "").toString().trim();
        if (!v) throw new Error("חסר תאריך לידה");

        // DD-MM-YYYY
        let m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
        if (m) {
            const dd = m[1];
            const mm = m[2];
            const yyyy = m[3];
            return `${yyyy}-${mm}-${dd}T12:00:00`;
        }

        // YYYY-MM-DD
        m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (m) {
            return `${v}T12:00:00`;
        }

        // ISO / DateTime
        if (v.includes("T")) {
            const datePart = v.split("T")[0];
            if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                return `${datePart}T12:00:00`;
            }
        }

        throw new Error(`פורמט תאריך לידה לא חוקי: ${v}`);
    }

    for (let member of familyMembers) {

        if (member.fromCRM) continue;

        if (!member.name || !member.id || !member.relation || !member.birthDate) {
            alert("חסר מידע עבור בן משפחה חדש");
            btn.innerText = "שגר למערכת 🚀";
            throw new Error("missing family member data");
        }

        const [firstName, ...lastNameParts] = member.name.trim().split(" ");
        const lastName = lastNameParts.join(" ") || "—";

        const roleValue = getRole(member.relation);
        if (!roleValue) {
            alert(`קשר משפחתי לא חוקי: ${member.relation}`);
            btn.innerText = "שגר למערכת 🚀";
            throw new Error("invalid family relation");
        }

        const birthDateForFireberry = normalizeBirthDate(member.birthDate);

        // ✅ payload סופי
        const payload = {
            firstname: firstName,
            lastname: lastName,
            pcfsystemfield127: member.id.toString(),
            pcfsystemfield125: Number(roleValue),
            pcfsystemfield131: birthDateForFireberry,
            accountid: account_id,

            // 🔁 העתקה מהלקוח
            ownerid: ACCOUNT.ownerId,
            pcfsystemfield303: ACCOUNT.financialPlannerId
        };


        // ✅ לוג מדויק של מה שנשלח
        console.group("📤 Sending /add-family-member");
        console.log("member:", member);
        console.log("raw birthDate:", member.birthDate);
        console.log("normalized birthDate:", birthDateForFireberry);
        console.log("payload:", payload);
        console.groupEnd();

        let response;
        try {
            response = await postRequest("/add-family-member", payload);
        } catch (err) {
            console.error("❌ add-family-member request failed:", err);
            alert("שגיאת תקשורת ביצירת בן משפחה");
            btn.innerText = "שגר למערכת 🚀";
            throw err;
        }

        // ✅ לוג תגובה מהשרת
        console.group("📥 Response /add-family-member");
        console.log("response:", response);
        console.log("created contactid:", response?.data?.Record?.contactid);
        console.groupEnd();

        const newUID = response?.data?.Record?.contactid;
        if (!newUID) {
            console.error("❌ Fireberry response:", response);
            alert("שגיאה ביצירת בן משפחה ב-CRM");
            btn.innerText = "שגר למערכת 🚀";
            throw new Error("failed to create family member");
        }

        member.uid = newUID;
        member.fromCRM = true;
    }
}

function getPrimaryInsuredName(card) {
    return card.querySelector(".inp-insured")?.value?.trim() || null;
}

function getPrimaryInsuredUID(card) {
    const insuredName = getPrimaryInsuredName(card);
    if (!insuredName) return null;

    const member = familyMembers.find(m => (m.name || "").trim() === insuredName);
    return member?.uid || null; // לפני saveFamilyMembers זה יכול להיות null וזה בסדר
}

function getInsuranceProductFromCard(card) {
    const productName = card
        .querySelector(".header-breadcrumb .hb-item")
        ?.textContent
        ?.trim();

    if (!productName) return null;
    return getProductByName("ביטוח", productName) || null;
}

function getInsuranceCompanyIdFromCard(card) {
    return card.querySelector(".inp-company")?.value || null;
}

function getInsuranceActionTypeFromCard(card) {
    return card.querySelector(".insurance_action_type")?.value || null;
}

async function saveInsurancePolicies(account_id, btn) {
    const insuranceCards = document.querySelectorAll('.card[data-type="ins"]');

    // נייצר את תאריך המכירה של היום
    const todayDate = new Date().toISOString();

    for (let card of insuranceCards) {

        // 1️⃣ מוצר
        const product = getInsuranceProductFromCard(card);
        if (!product) {
            throw new Error("לא נמצא מוצר ביטוח בכרטיס");
        }

        // 2️⃣ חברה
        const companyId = getInsuranceCompanyIdFromCard(card);
        if (!companyId) {
            throw new Error("חסרה חברה מבטחת בפוליסה");
        }

        // 3️⃣ מבוטח ראשי
        const primaryUID = getPrimaryInsuredUID(card);
        if (!primaryUID) {
            throw new Error("חסר מבוטח ראשי בפוליסה");
        }

        // 🔒 משעבד – חובה בריסק משכנתא / משועבד
        let mortgageValue = null;
        if (
            product.name === 'ריסק משכנתא' ||
            product.name === 'ריסק משועבד'
        ) {
            mortgageValue = card.querySelector(".policy_mortgage")?.value;

            if (!mortgageValue) {
                throw new Error("חובה לבחור משעבד בכל פוליסה");
            }
        }

        // 🆔 ת.ז מבוטח ראשי
        const primaryName = getPrimaryInsuredName(card);
        const primaryMember = familyMembers.find(
            m => (m.name || "").trim() === (primaryName || "").trim()
        );

        if (!primaryMember || !primaryMember.id) {
            throw new Error("לא נמצאה תעודת זהות למבוטח הראשי");
        }

        const primaryIdNumber = primaryMember.id;

        // 4️⃣ סוג פעולה
        const actionTypeText = getInsuranceActionTypeFromCard(card);
        const actionTypeId = getActionTypeId(actionTypeText);
        if (!actionTypeId) {
            throw new Error("סוג פעולה לא חוקי בפוליסה");
        }

        // 5️⃣ סטטוס פוליסה
        const statusText =
            card.querySelector(".insurance_operation_status")?.value;

        const statusMap = {
            "נשלח לעוצמה": 1,
            "נשלח ליצרן": 3
        };

        const operationStatus = statusMap[statusText];
        if (!operationStatus) {
            throw new Error("סטטוס פוליסה לא חוקי");
        }

        // 6️⃣ מבוטחים בפוליסה
        const insuredList = collectPolicyInsured(card);

        // שליפת סכום הביטוח של המבוטח הראשי מהטבלה
        let mainInsuredAmount = 0;
        const mainInsuredData = insuredList.find(ins => ins.contactId === primaryUID);
        if (mainInsuredData) {
            mainInsuredAmount = mainInsuredData.insuranceAmount;
        }

        // 7️⃣ הנחת מבוטח ראשי – אופציונלית
        const mainDiscountRaw = getMainInsuredPolicyDiscount(card);
        const mainDiscount =
            mainDiscountRaw !== null &&
                mainDiscountRaw !== undefined &&
                mainDiscountRaw.toString().trim() !== ""
                ? mainDiscountRaw.toString().trim()
                : null;

        // 8️⃣ יצירת פוליסה
        const policyPayload = {
            pcfclient: account_id,
            pcfmaininsured: primaryUID,
            pcfcompany: companyId,
            pcfproduct: product.id,
            pcfsaleoragent: actionTypeId,
            pcfoperationstatus: operationStatus,

            // 🔁 העתקה מהלקוח
            ownerid: ACCOUNT.ownerId,
            pcfsystemfield120: ACCOUNT.financialPlannerId,

            // 🆔 ת.ז מבוטח ראשי
            pcfsystemfield121: primaryIdNumber,

            // 👇 הוספת תאריך המכירה לפוליסה
            pcfsystemfield104: todayDate,

            //סכום ביטוח מבוטח ראשי בפוליסה
            pcfsystemfield114: mainInsuredAmount
        };

        // 🏦 משעבד (ריסק משכנתא / משועבד)
        if (mortgageValue) {
            policyPayload.pcfsystemfield123 = Number(mortgageValue);
        }

        if (mainDiscount !== null) {
            policyPayload.pcfdiscountmaininsured = mainDiscount;
        }

        const policyResponse = await postRequest("/create/insurance", policyPayload);
        const policyId = policyResponse?.data?.Record?.customobject1022id;

        if (!policyId) {
            throw new Error("שגיאה ביצירת פוליסה ב-CRM");
        }

        // 9️⃣ מבוטחים בפוליסה
        const healthProduct = getProductByName("ביטוח", "בריאות");
        const diseaseProduct = getProductByName("ביטוח", "מחלות");

        for (let insured of insuredList) {

            let productIdToUse = product.id;

            if (insured.splitProductType === "health") {
                productIdToUse = healthProduct?.id;
            }

            if (insured.splitProductType === "disease") {
                productIdToUse = diseaseProduct?.id;
            }

            const insuredPayload = {
                pcfsystemfield101: policyId,
                pcfsystemfield102: insured.contactId,
                pcfsystemfield105: insured.premium,
                pcfsystemfield111: insured.insuranceAmount,
                pcfsystemfield109: productIdToUse,
                pcfsystemfield110: companyId,

                // 🔁 העתקה מהלקוח
                ownerid: ACCOUNT.ownerId,
                pcfsystemfield112: ACCOUNT.financialPlannerId,

                //תאריך מכירה למבוטח בפוליסה
                pcfsystemfield114: todayDate
            };

            if (
                insured.discount !== null &&
                insured.discount !== undefined &&
                insured.discount !== ""
            ) {
                insuredPayload.pcfsystemfield107 = insured.discount;
            }

            const insuredRes = await postRequest("/create/policy-insured", insuredPayload);

            if (!insuredRes?.data?.Record) {
                throw new Error("שגיאה ביצירת מבוטח בפוליסה");
            }
        }
    }
}

async function saveFinancialProducts(account_id, btn) {

    const financeCards = document.querySelectorAll('.card[data-type="fin"]');

    // נייצר את תאריך המכירה של היום
    const todayDate = new Date().toISOString();

    for (let card of financeCards) {

        // 1️⃣ נתונים בסיסיים מהכרטיס (כולל ולידציות)
        const financeData = collectFinanceData(card);

        // 2️⃣ מוצר פיננסי
        const productName = card.querySelector(".hb-item")?.textContent?.trim();
        const product =
            getProductByName("פיננסים", productName) ||
            getProductByName("פנסיוני", productName);


        if (!product) {
            throw new Error("לא נמצא מוצר פיננסי");
        }

        // 3️⃣ יצירת פיננסי (Opportunity)
        const financialPayload = {
            accountid: account_id,
            contacttid: financeData.memberRef,
            pcfCompany: financeData.companyId,
            pcfProduct: product.id,
            pcfManagementFeeAccumulation: financeData.managementFeeAccumulation,
            pcfSaleOrAgent: financeData.saleOrAgent,
            pcfOperationalStatus: financeData.operationalStatus,
            pcfsystemfield148: financeData.memberIdNumber,

            // 🔁 העתקה מהלקוח
            ownerid: ACCOUNT.ownerId,
            pcfsystemfield100: ACCOUNT.financialPlannerId,

            // 👇 הוספת תאריך מכירה לפיננסי הראשי
            pcfsystemfield140: todayDate
        };


        // ➕ ד. ניהול מהפקדה – רק אם קיים (פנסיה)
        if (financeData.managementFeeDeposit !== undefined) {
            financialPayload.pcfManagementFeeDeposit =
                financeData.managementFeeDeposit;
        }

        const response = await postRequest("/create/financial", financialPayload);
        const financialId = response?.data?.Record?.opportunityid;

        if (!financialId) {
            throw new Error("שגיאה ביצירת פיננסי ב-CRM");
        }

        // שומר ID לשימוש עתידי
        card.dataset.financialId = financialId;

        // 4️⃣ ניודים
        const transfers = collectFinanceTransfers(card);
        for (let transfer of transfers) {
            await postRequest("/create/transfer", {
                pcfFinancial: financialId,
                pcfTransferringBody: transfer.companyId,
                pcfExpectedTransfer1: transfer.amount,

                // 🔁 העתקה מהלקוח
                ownerid: ACCOUNT.ownerId,
                pcfsystemfield102: ACCOUNT.financialPlannerId,

                // 👇 הוספת תאריך מכירה לגוף מעביר
                pcfsystemfield109: todayDate
            });

        }

        // 5️⃣ מעסיקים
        const employers = collectFinanceEmployers(card);
        for (let employer of employers) {

            const employerId = await getOrCreateEmployer(employer);

            await postRequest("/create/financial-employer", {
                pcfFinancial: financialId,
                PCFEMPLOYER: employerId,
                pcfMonthlyDeposit: employer.monthlyDeposit,

                // 🔁 העתקה מהלקוח
                ownerid: ACCOUNT.ownerId,
                pcfsystemfield102: ACCOUNT.financialPlannerId,

                // 👇 הוספת תאריך מכירה למעסיק בקופה
                pcfsystemfield107: todayDate
            });

        }
    }

    return true;
}

function validateAllBeforeSave() {
    try {

        // -------- FAMILY MEMBERS --------
        for (let member of familyMembers) {
            if (!member.name || !member.id || !member.relation || !member.birthDate) {
                throw new Error("יש בן משפחה עם נתונים חסרים");
            }
        }

        // -------- INSURANCE POLICIES --------
        const insuranceCards = document.querySelectorAll('.card[data-type="ins"]');

        for (let card of insuranceCards) {

            if (!getInsuranceCompanyIdFromCard(card)) {
                throw new Error("חובה לבחור חברה מבטחת בכל פוליסה");
            }

            // ✅ פה השינוי: לא בודקים UID, בודקים שם וקיום במערך
            const primaryName = getPrimaryInsuredName(card);
            if (!primaryName) {
                throw new Error("חובה לבחור מבוטח ראשי בכל פוליסה");
            }

            const product = getInsuranceProductFromCard(card);

            if (
                product &&
                (product.name === 'ריסק משכנתא' || product.name === 'ריסק משועבד')
            ) {
                const pledgerValue = card.querySelector('.policy_mortgage')?.value;


                if (!pledgerValue) {
                    throw new Error("חובה לבחור משעבד בפוליסת ריסק משכנתא / משועבד");
                }
            }


            const memberExists = familyMembers.some(m => (m.name || "").trim() === primaryName);
            if (!memberExists) {
                throw new Error("המבוטח הראשי שנבחר לא נמצא ברשימת בני המשפחה");
            }

            // ⛔ כולל פרמיה/סכום ביטוח וכו'
            collectPolicyInsured(card);

            // אם הנחת מבוטח ראשי אצלך חובה - תוסיף בדיקה אמיתית כאן
            // const discount = getMainInsuredPolicyDiscount(card);
            // if (!discount) throw new Error("חסרה הנחת מבוטח ראשי בפוליסה");
        }

        // -------- FINANCIAL PRODUCTS --------
        const financeCards = document.querySelectorAll('.card[data-type="fin"]');
        for (let card of financeCards) {
            collectFinanceData(card);
        }

        return true;

    } catch (err) {
        alert("❌ " + (err.message || "שגיאה בנתונים לפני שמירה"));
        return false;
    }
}

function finalizeSaveButton(btn) {
    btn.innerText = "✅ הנתונים נשמרו ב-CRM";
    btn.disabled = true;
    btn.onclick = null;
    btn.classList.add("btn-disabled");
}

async function simulateSave(btn) {
    console.log("🟦 simulateSave clicked", btn);

    const DEFAULT_BTN_TEXT = "🚀 שגר למערכת";

    btn.innerText = "בודק נתונים...";
    btn.disabled = true;

    const account_id = ACCOUNT_ID;

    try {
        // 1️⃣ ולידציה מלאה
        const ok = validateAllBeforeSave();
        console.log("🟦 validateAllBeforeSave result:", ok);

        if (!ok) {
            // ❌ אין alert כאן – הוולידציה כבר טיפלה בזה
            throw new Error("validation failed");
        }

        // 2️⃣ שמירת בני משפחה
        console.log("🟦 saving family members...");
        await saveFamilyMembers(account_id, btn);
        console.log("✅ family members saved");

        // 3️⃣ שמירת פוליסות
        console.log("🟦 saving insurance policies...");
        await saveInsurancePolicies(account_id, btn);
        console.log("✅ insurance policies saved");

        // 4️⃣ שמירת פיננסי
        console.log("🟦 saving financial products...");
        await saveFinancialProducts(account_id, btn);
        console.log("✅ financial products saved");

        // 5️⃣ הצלחה סופית
        finalizeSaveButton(btn);

    } catch (e) {
        console.warn("⛔ Save stopped:", e?.message);
        console.warn("⛔ stack:", e?.stack);

        // ❌ אין alert כאן!
        // אם זו שגיאת ולידציה – היא כבר הוצגה למשתמש
        // אם זו שגיאת מערכת – היא כבר טופלה בפונקציה הרלוונטית

    } finally {
        // מחזירים את הכפתור למצב עבודה
        if (!btn.classList.contains("btn-disabled")) {
            btn.innerText = DEFAULT_BTN_TEXT;
            btn.disabled = false;
        }
    }
}



window.onload = async function () {
    const account_id = ACCOUNT_ID;

    if (!account_id) {
        alert("לא התקבל מזהה לקוח");
        return;
    }

    await get_account(account_id);
    await loadFamilyMembers(account_id);

    categories = await getRequest("/get_products");
    companies = (await getRequest("/get_companies")).companies;
    const mortgageRes = await getRequest("/get_policy_mortgage_options");
    console.log("RAW mortgageRes:", mortgageRes);

    policyMortgageOptions = mortgageRes?.options || [];
    console.log("policyMortgageOptions after assign:", policyMortgageOptions);


    // 🔍 לוג אמת – גוף מעביר בלבד
    console.group("🔎 Companies – transfer_only check");
    console.table(
        companies.map(c => ({
            name: c.company_name,
            company_type: c.company_type,
            transfer_only: c.transfer_only,
            transfer_only_normalized: (c.transfer_only || "").toString().trim()
        }))
    );
    console.groupEnd();

    displayCategories(categories);
    displayProducts(categories);
    productCategoryReview();
    chooseCategory();
}
