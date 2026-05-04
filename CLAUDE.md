# otzma-server — Otzma Insurance Unified Backend

## לקוח
עוצמה ביטוח (Otzma Insurance) — סוכנות ביטוח ופיננסים.

## מה הפרויקט עושה
שרת Express אחד שמאחד 4 מערכות:

1. **טעינת הצעות** — iframe בפיירברי ליצירת פוליסות, פיננסים, מעסיקים
2. **מסלקה** — קליטת נתוני מסלקה פנסיונית, יצירת מוצרי מסלקה, ניוד
3. **הר הביטוח** — העלאת אקסל הר הביטוח ויצירת רשומות בפיירברי
4. **תבניות וואטסאפ** — ניהול תבניות הודעה לסנריו של n8n (החליף Make Data Store)

## דומיין ושרת
- דומיין: `api.otzma-ins.co.il`
- שרת: `srv1187409` — `/var/www/otzma-api`
- PM2 process: `otzma-api` (port 3000)
- GitHub: `avibroner/otzma-api-backend`

## Deploy
```bash
ssh root@srv1187409
cd /var/www/otzma-api
git pull
npm install
pm2 restart otzma-api
pm2 logs otzma-api --lines 50
```

## מבנה קבצים
```
server.js                    ← Express ראשי, מחבר את כל ה-routes + activity log middleware
lib/
  fireberry.js               ← API משותף לפיירברי (postRequest, getRequest, putRequest, deleteRequest)
  excel-parser.js            ← פרסור אקסל הר הביטוח (xlsx)
  har-habituach-helpers.js   ← חיפוש אדם, מחיקה, יצירה, סיכום פרמיות
  logger.js                  ← SQLite activity log (events table) — init/logApiCall/logFrontendEvent/query/cleanup
  whatsapp-templates-db.js   ← SQLite — טבלת תבניות וואטסאפ (init/listAll/getRandom/create/deactivate)
middleware/
  activityLog.js             ← Express middleware — תופס כל api_call, מסמן orphans, רושם ל-events
  basicAuth.js               ← basic auth משותף ל-admin pages (ADMIN_USER/ADMIN_PASS)
routes/
  quotes.js                  ← טעינת הצעות + validation בכל /create/* + endpoint /api/log/frontend
  mislaka-data.js            ← GET /api/mislaka/data?id=XXX — שליפת JSON מפיירברי לדשבורד
  mislaka-webhook.js         ← POST /api/mislaka/webhook — קליטת מסלקה + עדכון ליד + יצירת מוצרים
  mislaka-transfer.js        ← GET/POST /api/mislaka/transfer — דף ניוד עם תצוגת תהליך
  har-habituach.js           ← הר הביטוח — upload Excel + streaming progress
  dashboard.js               ← /admin/dashboard + /api/admin/* — basic auth
  whatsapp-templates.js      ← /api/whatsapp-templates/* + /admin/whatsapp-templates — basic auth
scripts/
  templates-seed.json        ← 20 תבניות וואטסאפ (אחרי dedup מ-22 ב-Make)
  seed-whatsapp-templates.js ← Seed script — רץ אוטומטית ב-server.js בעלייה (idempotent)
public/
  quotes/                    ← HTML/JS/CSS של טעינת הצעות (iframe בפיירברי)
  mislaka/
    dashboard.html           ← דשבורד מסלקה
    analysis.html            ← ניתוח מסלקה
    transfer.html            ← דף ניוד (נפתח מ-iframe בפיירברי)
  har-habituach/
    index.html               ← דף העלאת אקסל הר הביטוח
  admin/
    dashboard.html, dashboard.js     ← Activity dashboard — events, filters, drawer
    whatsapp-templates.html          ← ניהול תבניות וואטסאפ (טופס + רשימה + מחיקה)
logs/
  activity.db                ← SQLite (auto-created, 90-day rotation, .gitignore'd)
data/
  whatsapp.db                ← SQLite (auto-created, .gitignore'd) — תבניות וואטסאפ, ללא rotation
```

## URLs
| URL | תיאור |
|-----|--------|
| `/?objectid=...` | טעינת הצעות (iframe) |
| `/mislaka/dashboard.html?id=...` | דשבורד מסלקה |
| `/mislaka/analysis.html?id=...` | ניתוח מסלקה |
| `/api/mislaka/webhook` | וובהוק קליטת מסלקה מפיירברי |
| `/api/mislaka/data?id=...` | שליפת JSON מסלקה לדשבורד |
| `/api/mislaka/transfer?id=...` | דף ניוד מוצר מסלקה |
| `/har-habituach/` | הר הביטוח — העלאת אקסל |
| `/admin/dashboard` | **Activity log dashboard** (basic auth) — חקירת בעיות, רשומות יתום, JS errors |
| `/admin/whatsapp-templates` | **ניהול תבניות וואטסאפ** (basic auth) — טופס + רשימה + מחיקה |
| `/api/whatsapp-templates/random` | (basic auth) **n8n קורא לכאן** — מחזיר תבנית רנדומלית פעילה |
| `/api/whatsapp-templates` | GET (list) / POST (create) — basic auth |
| `/api/whatsapp-templates/:id` | DELETE — soft delete (`is_active=0`), basic auth |
| `/api/log/frontend` | קליטת telemetry מהדפדפן (iframe loads, JS errors) |
| `/health` | Health check |

## אובייקטים בפיירברי

| אובייקט | Object ID | תפקיד |
|---------|-----------|--------|
| מסלקה | 1009 | רשומת מסלקה עם JSON גולמי, שדה pcfLead מקשר לליד |
| מוצר מסלקה | 1031 | פוליסה/קופה בודדת מפורקת מהמסלקה |
| ליד | 1003 | ליד פיננסי |
| פיננסים | opportunity | רשומת פיננסים (נוצרת בניוד) |
| ניוד / גוף מעביר | 1017 | גוף מעביר + סכום |
| מעסיק | 1018 | מעסיק |
| מעסיק בקופה | 1019 | קישור מעסיק לפיננסי |
| פוליסה | 1022 | ביטוח (טעינת הצעות) |
| מבוטח בפוליסה | 1021 | מבוטחים (טעינת הצעות) |
| חברות | 1016 | חברות ביטוח/פנסיה |
| הר הביטוח | 1005 | רשומות הר הביטוח |

## Fireberry API Token
הטוקן נמצא ב-`lib/fireberry.js`. הוא משמש לכל הקריאות לפיירברי.

## זרימת מסלקה
1. פיירברי שולח וובהוק עם `{ID, Transaction}` ל-`/api/mislaka/webhook`
2. המערכת שולפת JSON מ-API מסלקה (`mislaka-api.co.il`)
3. שומרת JSON ברשומת מסלקה (1009)
4. מעדכנת ליד (שם, ת.ז, מייל, כתובת, סך הפקדות, סך צבירות, מיופי כוח)
5. מוחקת מוצרי מסלקה ישנים (1031) ויוצרת חדשים
6. כל מוצר ממופה לסוג מוצר + חברה (fuzzy match על שם יצרן)

## זרימת ניוד
1. משתמש לוחץ על לינק במוצר מסלקה → `/api/mislaka/transfer?id=XXX`
2. הדף שולח POST ל-`/api/mislaka/transfer/execute`
3. המערכת: שולפת מוצר → מוצאת ליד → מחפשת/יוצרת מעסיק → יוצרת פיננסי + מעסיק בקופה + גוף מעביר
4. Streaming progress מוצג למשתמש בזמן אמת

## מיפוי שדות מוצר מסלקה (1031)
| שדה פיירברי | Label | מקור ב-JSON |
|-------------|-------|-------------|
| pcfsystemfield100 | קישור למסלקה | מזהה 1009 |
| pcfsystemfield101 | סוג מוצר | lookup לפי סוג מוצר + סוג קרן פנסיה |
| pcfsystemfield102 | סטטוס | picklist: 1=פעיל, 2=לא פעיל, 3=לא רלוונטי |
| pcfsystemfield103 | מסלול השקעה | פירוט מסלולי השקעה.שם מסלול |
| pcfsystemfield104 | אחוז הפרשה | סכום כל אחוזי ההפרשה |
| pcfsystemfield105 | הפקדה חודשית | הפקדה אחרונה סה״כ |
| pcfsystemfield106 | הפקדה שנתית | חודשי × 12 |
| pcfsystemfield107 | תאריך הפקדה | ת. נכונות |
| pcfsystemfield108 | תאריך הצטרפות | ת. הצטרפות |
| pcfsystemfield109 | סוג חשבון | picklist: 1=שכיר, 2=עצמאי, 3=פרט |
| pcfsystemfield110 | מעסיק | מעסיקים.שם מעסיק |
| pcfsystemfield111 | צבירה | סך חיסכון |
| pcfsystemfield112 | יתרה עתידית | סה״כ יתרה עתידית |
| pcfsystemfield113 | דמ"נ מהפקדה | דמנה״ל הפקדה |
| pcfsystemfield114 | דמ"נ מצבירה | דמנה״ל צבירה |
| pcfsystemfield115 | חברה | lookup — fuzzy match על שדה יצרן |
| pcfsystemfield116 | מספר קופה/פוליסה | מספר פוליסה |
| pcfsystemfield117 | שכר | שכר מדווח להפקדה |
| pcfsystemfield118 | שם תוכנית | שם תוכנית |

## שדות ליד (1003) שמתעדכנים מהמסלקה
| שדה | Label |
|-----|-------|
| name | שם |
| pcfsystemfield101 | ת.ז |
| pcfsystemfield560 | מייל |
| pcfsystemfield331 | עיר |
| pcfsystemfield531 | רחוב |
| pcfsystemfield562 | סך הפקדות |
| pcfsystemfield563 | סך צבירות |
| pcfsystemfield564 | מיופי כוח (טקסט, כל מיופה בשורה חדשה) |

## הערות טכניות
- Mislaka API token צריך להיות ב-env var `MISLAKA_TOKEN` (כרגע hardcoded כ-empty)
- מיפוי חברות הוא fuzzy — שם היצרן במסלקה (למשל "מנורה מבטחים פנסיה וגמל בעמ") ממופה לפי contains לחברה בפיירברי ("מנורה")
- מוצרי מסלקה ישנים נמחקים (soft delete) בכל קליטה חדשה
- הר הביטוח הומר מ-Next.js ל-Express+vanilla JS
- Buffer mapping של הר הביטוח נשמר in-memory (לא ב-Redis כמו בגרסה הקודמת)

## מערכת Activity Log + Validation
**הבעיה שזה פותר:** אם נוצרת רשומה ב-Fireberry בלי FK חיוני (למשל פיננסי בלי `accountid`), אין לנו דרך לדעת מי יצר אותה, מאיזה לקוח, ועם איזה payload.

**שלוש שכבות:**
1. **Validation** ב-`routes/quotes.js`: כל `/create/*` בודק שדות חובה לפני שמירה. חסר → 400 + לוג עם `is_validation_failure=1`.
2. **Activity log** ב-`middleware/activityLog.js`: כל api_call נרשם ל-SQLite (`logs/activity.db`) עם session_id, account_id, user_id (מ-headers `x-*` שה-frontend שולח), request body, response, fireberry record id, duration.
3. **Frontend telemetry** ב-`public/quotes/app.js`: כל פתיחת iframe + JS errors נשלחים ל-`/api/log/frontend`.

**איך משתמשים:**
- פותחים `https://api.otzma-ins.co.il/admin/dashboard` עם basic auth (env vars `ADMIN_USER` + `ADMIN_PASS` מוגדרים ב-`/var/www/otzma-api/.env`)
- מסננים: לפי account_id, session_id, event_type, או "רק errors / orphans / validation failures"
- click על שורה → drawer עם raw request/response JSON
- "צפה בכל הסשן" → רואים את כל המסע של אותו משתמש מ-iframe load ועד שגיאה

**Headers שה-frontend שולח אוטומטית:**
- `x-session-id` — UUID שנוצר פעם אחת בטעינת iframe (מחבר frontend ↔ backend)
- `x-account-id` — ה-objectid מה-URL
- `x-user-id` — ownerid של הסוכן (אחרי שנטען)

**Rotation:** events ישנים מ-`LOG_RETENTION_DAYS` (ברירת מחדל 90) נמחקים אוטומטית פעם ביום (`setInterval` ב-server.js).

**Orphan detection:** middleware מסמן `is_orphan=1` כשcreate הצליח (200) אבל חסר FK חיוני בפ-payload לפי טבלת `ORPHAN_RULES` ב-`middleware/activityLog.js`.

## מערכת תבניות וואטסאפ (n8n)
**הבעיה שזה פותר:** סנריו ב-n8n שולח הודעות וואטסאפ ללידים חדשים מהר הביטוח. צריך מאגר תבניות שאפשר לשלוף מהן רנדומלית, ועמוד אדמין לעדכן אותן בלי לגעת בקוד. החליף את ה-Make Data Store הקיים.

**DB:** `data/whatsapp.db` (SQLite, נפרד מ-`logs/activity.db`, ללא rotation — דאטה לוגית).
**טבלה:** `whatsapp_templates(id, name, body, is_active, created_at)`.

**Endpoints:**
- `GET /api/whatsapp-templates/random` — n8n קורא לכאן. מחזיר `{id, name, body}` מתבנית פעילה רנדומלית. מוחרג מ-activity log (תדירות גבוהה).
- `GET /api/whatsapp-templates` — רשימת כל התבניות (לעמוד אדמין).
- `POST /api/whatsapp-templates` — יצירה. body: `{name, body}`. validation: body לא ריק, מקסימום 4096 תווים.
- `DELETE /api/whatsapp-templates/:id` — soft delete (`is_active=0`).

**Auth:** כל ה-endpoints כולל `/random` מאחורי `basicAuth` משותף (`middleware/basicAuth.js`). n8n שולח header `Authorization: Basic <base64>`.

**Placeholder convention:** התבניות מכילות `{שם}`. השרת מחזיר אותו גולמי — n8n מחליף ל-name של הליד לפני שליחה.

**Seed אוטומטי:** בעלייה הראשונה של השרת, `scripts/seed-whatsapp-templates.js` מזריע 20 תבניות מ-`scripts/templates-seed.json`. Idempotent — לא רץ אם הטבלה לא ריקה. ל-reseed ידני: `node scripts/seed-whatsapp-templates.js --force` (יזריע נוספים, לא ימחק קיימים).

**עמוד אדמין:** `https://api.otzma-ins.co.il/admin/whatsapp-templates` (basic auth) — טופס הוספה (name + body), רשימת תבניות פעילות, כפתור מחיקה.
