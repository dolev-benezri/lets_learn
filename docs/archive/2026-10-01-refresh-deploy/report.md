# לסרוק פעם בלילה, לפרוס באותה ריצה

הדרך הנכונה היא ריצה אחת בלילה ב-GitHub Actions. היא סורקת את הידיעון פעם אחת לכל הסמסטרים, בקצב איטי ומזוהה. היא כותבת קבצים רק אם כל הבדיקות עברו. ובאותה ריצה היא גם פורסת את `web/` לאתר. אבל לפני שכותבים שורה אחת של workflow צריך לעשות **בדיקה אחת: בקשה בודדת לידיעון מתוך runner של GitHub**. רק היא תגיד אם אפקה חוסמת כתובות של חוות שרתים. אם הבדיקה נכשלת, הסריקה רצה מהמחשב בבית, והאתר נשאר אותו אתר. בצד הסורק, הרווח הגדול והפשוט הוא איחוד שתי הריצות היומיות לריצה אחת. זה **חוסך חצי מהבקשות (בערך 169 במקום 338)**, וריענון מדורג חוסך עוד. בצד המשתמש הנתונים זעירים, **כ-24 KB דחוסים לשני הסמסטרים**. לכן הנדסת מטמון כמעט לא משנה. מה שמשנה הוא שלושה דברים: טריות כנה ("נבדק" לעומת "השתנה"), אף בחירה שמורה לא נמחקת בשקט, והחלטה עכשיו על כתובת האתר הקבועה, כי `localStorage` קשור לכתובת ולא עובר איתה. ההמלצה למארח היא GitHub Pages עם דומיין משלך. אם לא קונים דומיין, עדיף Cloudflare, כי אז הכתובת שתבחר היום תישאר לתמיד.

## ריצה אחת לכל הסמסטרים חוסכת חצי מהעומס על הידיעון

היום כל ריצה של `scripts/scrape.mjs` שולחת את אותן בקשות, בלי קשר לסמסטר. הפרמטר `--semester` משמש רק ב-`buildDataset()` ובשם תיקיית הפלט ([scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)). הפיצול לסמסטרים קורה אחרי ההורדה. `buildDataset()` שומרת קבוצה רק אם כל המפגשים שלה שייכים לסמסטר, ומסננת מבחנים לפי עמודת הסמסטר ([build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs)). כלומר הריצה של סמסטר ב' **חוזרת על 100% מהבקשות** של סמסטר א'. ריצה מלאה כוללת 2 בקשות פתיחה, 9 בקשות `S_SHOW_PROGS` (רשימה אחת לכל קוד), 81 בקשות `S_LOOK_FOR_NOSE` (אחת לכל קורס), כ-76 בקשות `S_CourseDetails`, ובקשת `S_EXAMS` אחת. בשני קובצי הנתונים יש 81 קורסים, ול-76 מהם יש נקודות זכות ([נתוני סמסטר א'](https://github.com/dolhack/lets_learn/blob/main/web/data/afeka/2027-1/30-2026.json), [נתוני סמסטר ב'](https://github.com/dolhack/lets_learn/blob/main/web/data/afeka/2027-2/30-2026.json)).

| שיטה | בקשות לריצה | בקשות לשבוע בעונת רישום |
|---|---|---|
| היום: שתי ריצות מלאות ביום | כ-338 | כ-2,370 |
| ריצה משולבת אחת שכותבת את כל הסמסטרים | כ-169 | כ-1,180 |
| מדורג: כל לילה רק פתיחה + `S_LOOK_FOR_NOSE` + `S_EXAMS`, ופעם בשבוע ריצה מלאה | כ-84 | כ-670 |
| מחוץ לעונת רישום: ריצה מלאה פעם בשבוע | כ-169 | כ-169 |

הסדר נכון כך. קודם מאחדים: אוספים את `lists`, `raw` ו-`exams` פעם אחת, ואז קוראים ל-`buildDataset()` לכל סמסטר שמופיע במפגשים (א', ב', וקיץ אם יש). כל קובץ עובר `validate()` ו-`compareToPrevious()`. כותבים את כולם רק אם כולם עברו. כך נשמר החוזה הקיים של "לא כותבים כלום אם משהו נכשל". הדירוג בא אחר כך. הוא נשען על חלוקה פשוטה של השדות. שדות שמשתנים מהר מגיעים רק מ-`S_LOOK_FOR_NOSE`: הקבוצות, הדגל "הקורס מלא", ימים, שעות, חדרים ומרצים. שדות איטיים הם החברות ברשימות, `minCredits`, נקודות זכות ודרישות קדם ([parse.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs)). את הפרטים האיטיים שומרים בקובץ מטמון לפי מספר קורס, לא לפי `detailsArgs`. הסיבה: `detailsArgs` מכיל מספר קבוצה, ומספור מחדש של קבוצה יכריח הורדה מיותרת. מורידים פרטי קורס מחדש רק אם אין להם מטמון, אם המטמון בן יותר משבוע, או אם קבוצות הקורס השתנו. אין לנו עדיין סדרת זמן שמראה כמה מהר כל שדה משתנה בפועל. לכן הדירוג צריך לחכות לשבועיים-שלושה של יומן שינויים מהריצה המשולבת.

בקשות מותנות (`ETag`, `If-None-Match`) כנראה לא יחסכו כלום. דפים דינמיים של ASP.NET שולחים כברירת מחדל `Cache-Control: private` ולא שולחים `ETag` או `Last-Modified`, אלא אם הקוד מבקש זאת במפורש ([Ultra-Fast ASP.NET](https://www.codemag.com/Article/100013/Ultra-Fast-ASP.NET-Chapter-3---Caching)). זה לא נבדק מול הידיעון עצמו. בדיקת ה-runner שבסוף הדוח תענה על זה בחינם, כי היא מדפיסה את הכותרות. התחליף הנכון הוא גיבוב של הרשומה המפוענחת, לא של ה-HTML הגולמי. ה-HTML עלול להכיל עוגיות ושדות נסתרים שמשתנים בכל טעינה. הגיבוב לא מוריד בקשות. אבל הוא מונע commit ריק, מזין את הדירוג, ומייצר את סיכום השינויים.

## הנימוס נקבע אצלנו: 2.5 שניות, לילה, ועצירה בחסימה הראשונה

אין לידיעון `robots.txt`. בתקן RFC 9309 אין `crawl-delay`, ותשובת 404 על `robots.txt` פירושה שמותר לגשת לכל משאב ([RFC 9309, סיכום](https://www.searchengineworld.com/rfc9309-robots-txt-quietly-became-an-official-internet-standard)). לכן הנימוס תלוי רק בנו. לאתר עצמו יש שני סימנים ברורים. **מרווח של 1,000 ms נחסם, ומרווח של 2,000 ms עבר**. ובכל זאת ברירת המחדל בקוד עדיין `'1000'` ([HISTORY §7](https://github.com/dolhack/lets_learn/blob/main/docs/HISTORY.md), [scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)). החסימה השעתית נאכפת לפי כתובת IP, ומציינת שעה מדויקת לניסיון הבא: "השהיית גישה זמנית… יותר מידי שאילתות בשעה… ניתן לנסות שוב החל משעה 19:00" ([throttled.html](https://github.com/dolhack/lets_learn/blob/main/scripts/fixtures/throttled.html)). אותו נוסח מופיע גם בסורק של בראודה, שגם היא על Michlol ([braude-mcp](https://raw.githubusercontent.com/oshriagronov/braude-mcp/main/src/scrapers/firefly.ts)). כלומר זה מנגנון של המוצר, לא הגדרה מקומית של אפקה.

ההגדרות המומלצות הן אלה. ברירת מחדל של **2,500 ms עם רעד של ±500 ms**. בקשות בזו אחר זו בלבד, אף פעם לא במקביל. `AbortSignal.timeout` של 20–30 שניות לכל בקשה. היום אין timeout בכלל. אם יש `Retry-After` ב-429 או ב-503, מכבדים אותו. גבול כולל של כ-10 ניסיונות חוזרים לריצה. נכון להיום, דף "Request Rejected" של ה-WAF מקבל עד 5 ניסיונות לכל בקשה. זה כמעט מה שלא צריך לעשות מול WAF שכבר לא אוהב אותך. אחרי שתיים-שלוש דחיות ברצף עוצרים את כל הריצה, לא כותבים כלום ומתריעים. בחסימה השעתית עוצרים מיד ורושמים ביומן את השעה שהדף נותן. אלה נוהגי נימוס מקובלים בתעשייה, לא תקן ([undici: crawling best practices](https://undici.nodejs.org/best-practices/crawling)).

ה-User-Agent צריך לזהות את הכלי ולתת דרך ליצור קשר, למשל `afeka-scheduler/1.1 (+https://<site>; <email>)`. הסורק של בראודה מתחזה לדפדפן Chrome. לא להעתיק את זה. מחרוזת שקופה היא הסימן העיקרי לתום לב. היא מאפשרת לצוות ה-IT של אפקה לכתוב לבעלים במקום לחסום. את הריצה קובעים לשעות הלילה בישראל, בדקה שאינה :00 או :30. בעונת רישום מדלגים גם על השעתיים שסביב פתיחת חלונות רישום, כי אז השרת עמוס בסטודנטים אמיתיים. את רשימת החלונות האלה צריך להזין ידנית מלוח השנה של אפקה. לא בדקנו אותו.

גם החוסן צריך שדרוג. יש כבר בדיקת כיווץ שעוצרת כתיבה אם מספר הקורסים יורד ביותר מ-10%, הקורסים המוצעים ביותר מ-20% או הקבוצות ביותר מ-25%. יש גם בדיקות מינימום ופיקסצ'רים מוזהבים לפרסרים ([build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs), [test/parse.test.mjs](https://github.com/dolhack/lets_learn/blob/main/test/parse.test.mjs)). מה שחסר הוא זיהוי של שבירה שקטה בשדה בודד, כמו `minCredits` שהופך ל-0 ([HISTORY §7](https://github.com/dolhack/lets_learn/blob/main/docs/HISTORY.md)). כדאי להוסיף בדיקות "בריאות שדה" על הנתונים שכבר בזיכרון: אפס מפגשים עם `day === null`, נקודות זכות ליותר מ-90% מהקורסים המוצעים, ומספר דרישות הקדם בטווח של ±20% מהקובץ הקודם. בנוסף, אם בדף יש "קורס מסוג" אבל הפרסר החזיר אפס קבוצות, או שיש בו תאריכים אבל אפס מבחנים, זו שגיאה ולא "לא פורסם". לצד זה צריך לבדוק שתאריכי המבחנים נופלים בשנת הלימודים שבונים. אחרת אפשר לפרסם בטעות את לוח המבחנים של השנה הקודמת. כשריצה נכשלת, שומרים את ה-HTML הבעייתי כ-artifact של ה-workflow, לא ב-repo. כך קל לבנות ממנו פיקסצ'ר חדש. לבסוף, הסורק כותב סיכום שינויים אנושי ומשתמש בו כהודעת ה-commit, למשל `data(afeka): 2027-1 +3 groups, 12 became full, 2 room changes`.

הסיכון המשפטי נמוך אבל לא אפסי. לפי עורך דין ישראלי, אין בישראל חוק או פסיקה מנחה שאוסרים באופן גורף גרידה של אתרים ציבוריים. הסיכון המרכזי הוא "שיבוש מחשב" לפי חוק המחשבים, וקצב מנומס מטפל בו ([עו"ד מוטי כהן, 2025](https://moticohenadv.com/%D7%94%D7%90%D7%9D-%D7%9E%D7%95%D7%AA%D7%A8-%D7%9C%D7%91%D7%A6%D7%A2-%D7%A1%D7%A8%D7%99%D7%A7%D7%AA-%D7%90%D7%AA%D7%A8%D7%99%D7%9D-data-scraping/)). המקור הזה נקרא רק דרך תקצירי חיפוש. מנגד, הרשות להגנת הפרטיות חתמה על עמדה בינלאומית: מידע אישי שזמין לציבור עדיין מוגן ([ICO, אוקטובר 2024](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/10/global-privacy-authorities-issue-follow-up-joint-statement-on-data-scraping-after-industry-engagement/)). שמות מרצים הם מידע כזה. לכן לא מעשירים אותם, לא בונים היסטוריה לפי מרצה, לא מזינים את הנתונים למערכות AI, ומוסיפים באתר שורת יצירת קשר והסרה. את תנאי השימוש של אפקה לא הצלחנו לקרוא. הבעלים צריך לקרוא אותם בעצמו. לא מצאנו שום מוסד ישראלי שנותן לפרויקטים של סטודנטים פיד רשמי. גם הסורקים של הטכניון, MTA ובראודה לא מזכירים אישור ([technion-sap-info-fetcher](https://github.com/michael-maltsev/technion-sap-info-fetcher), [mta-course-scraper](https://raw.githubusercontent.com/ranl/mta-course-scraper/master/mta_course_scraper/spiders/course_spider.py)). ובכל זאת מייל קצר לאפקה זול ומשתלם. "כן" מסיר את רוב העמימות. "לא, תודה" כדאי לשמוע מוקדם.

## GitHub Actions חינמי, אבל השעון שלו מאחר בשעות

עבור repo ציבורי עם runners רגילים של GitHub, Actions **חינמי לגמרי** ([GitHub billing](https://raw.githubusercontent.com/github/docs/main/content/billing/concepts/product-billing/github-actions.md)). משרה יכולה לרוץ עד 6 שעות, והסריקה לוקחת כ-6 דקות. מאז מרץ 2026 אפשר לכתוב cron באזור זמן IANA, כמו `Asia/Jerusalem` ([GitHub Changelog](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/)). בגלל שעון קיץ צריך להימנע מ-02:00–03:00 שעון מקומי ([GitHub docs](https://raw.githubusercontent.com/github/docs/main/data/reusables/repositories/actions-scheduled-workflow-example.md)). הבעיה היא האמינות. GitHub עצמה כותבת שריצות מתוזמנות "יכולות להתעכב" בעומס, במיוחד בתחילת כל שעה, וחלקן אף נזרקות ([schedule-delay](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/schedule-delay.md)). מאז 26 באוגוסט 2026 משתמשים מדווחים על **עיכובים של 4–6 שעות ועל ריצות שלא מתבצעות בכלל**. נכון לסוף ספטמבר לא הייתה תגובה של GitHub ([discussion #207346](https://github.com/orgs/community/discussions/207346)). הסורק של הטכניון מתוזמן ל-08:00 UTC, אבל ה-commits שלו בספטמבר נוחתים בין 12:22 ל-14:04 UTC ([technion-sap-info-fetcher](https://github.com/michael-maltsev/technion-sap-info-fetcher)).

המסקנה המעשית: מתזמנים מוקדם ומקבלים סחיפה של כמה שעות. מומלץ לקבוע שתי שורות cron בלילה, למשל 00:17 ו-03:47 שעון ישראל. הריצה מדלגת אם `status.json` כבר נבדק ב-12 השעות האחרונות, או אם בישראל כבר אחרי 07:00. השמירה הזו היא המלצה שלנו, לא תבנית מתועדת. היא מטפלת גם בריצה שנזרקה וגם בריצה שאיחרה עד שעות היום. אם בעונת רישום צריך שעה מדויקת, cron חיצוני כמו cron-job.org יכול לקרוא ל-API של `workflow_dispatch` עם PAT מוגבל. כך עוקפים את המתזמן של GitHub לגמרי. עוד מלכודת: ב-repo ציבורי, תזמונים **מושבתים אחרי 60 יום בלי פעילות** ([events-that-trigger-workflows](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md)). commit יומי של `status.json` מחזיק את ה-repo פעיל. ההנחה שגם commit של בוט נחשב לפעילות מבוססת על נוהג הקהילה, לא על התיעוד. לכן לפני כל עונת רישום שווה להציץ בלשונית Actions.

השאלה הפתוחה הגדולה היא כתובת ה-IP. אין ראיה ישירה לכאן או לכאן לגבי `yedionpub.afeka.ac.il`. אבל המקרים הקרובים מצביעים על סיכון אמיתי. הסורק של הטכניון הוסיף תמיכה ב-proxy במרץ 2026 והשבית אותה באפריל, ומאז הוא רץ ישירות מ-GitHub ([commit history](https://github.com/michael-maltsev/technion-sap-info-fetcher/commits/main)). סורק התואר הראשון של הטכניון מחזיק secrets של proxy, והתזמון שלו כבוי מיוני 2025 ([technion-ug-info-fetcher](https://github.com/michael-maltsev/technion-ug-info-fetcher)). אותו סורק גם נאלץ להתקין על ה-runner תעודת ביניים של הטכניון. זה סימן ששרתים אקדמיים בישראל לפעמים מגישים שרשרת TLS חסרה. דף "Request Rejected" של אפקה הוא דף של F5. F5 יכול לחסום לפי מוניטין IP או לפי מיקום, אם מנהל המערכת הפעיל זאת. לא ידוע אם הפעיל.

אם ה-runner נחסם, סדר החלופות ברור. **ראשונה: Task Scheduler במחשב Windows של הבעלים**, שמריץ את אותו סקריפט ודוחף עם PAT מוגבל ל-repo הזה בלבד. זו אותה כתובת IP שעובדת היום. היא לא מוסיפה משטח תקיפה. ו-push בזהות אנושית מפעיל workflows של `on: push` כרגיל. החיסרון: המחשב חייב להיות דלוק, וכשלונות שקטים אלא אם הסקריפט מדווח בעצמו. **שנייה: runner self-hosted באותו מחשב**. GitHub ממליצה במפורש לא לעשות את זה ב-repo ציבורי, כי fork עם PR יכול להריץ קוד על המכונה ([GitHub docs](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/self-hosted-runner-security.md)). אם בוחרים בזה, צריך נעילה קפדנית: workflow רק של `schedule` ו-`workflow_dispatch`, label ייעודי, ומשתמש מקומי בלי הרשאות. **שלישית: VM חינמי של Oracle באזור ירושלים** ([Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)), או Lambda ב-`il-central-1`. הן נותנות כתובת ישראלית, אבל עדיין של חוות שרתים. Cloudflare Workers בחינם **לא מתאים** לסריקה: יש מגבלה של 50 בקשות יוצאות לכל הפעלה, ואנחנו צריכים 169 ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [changelog 2026-02-11](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/)).

אותה דרישה חלה על כל החלופות: כשל צריך להיות גלוי. כברירת מחדל, מייל על כשל של ריצה מתוזמנת נשלח למי שיצר את ה-workflow או ערך לאחרונה את שורת ה-cron ([GitHub docs](https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/workflows-and-actions/notifications-for-workflow-runs.md)). אבל ריצה שנזרקה לא יוצרת ריצה בכלל, ולכן גם לא מייל. מכאן שלושה מנגנונים. צעד `if: failure()` שפותח issue אחד בשם "Scheduled scrape failing", או מוסיף לו תגובה, וסוגר אותו בהצלחה הבאה. אזהרת טריות באתר שמבוססת על `checkedAt`. ואם רוצים, "מתג אדם מת" חינמי בסגנון healthchecks.io, שמתריע אם לא הגיע ping תוך 36 שעות.

## 24 KB של נתונים: הכתובת הקבועה חשובה יותר מהמארח

`web/` כולו שוקל כ-89 KB אחרי gzip, כולל שני קובצי ה-JSON. GitHub Pages מתאים לזה בקלות: עד 1 GB לאתר, ומגבלה רכה של 100 GB תעבורה בחודש ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). אפשר לפרסם רק את `web/` עם `path: web` ב-`actions/upload-pages-artifact`. כך `docs/`, `scripts/` ו-`test/` לא מתפרסמים ([upload-pages-artifact](https://github.com/actions/upload-pages-artifact), [custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)). יש כאן מלכודת אחת שקובעת את מבנה ה-workflow. **push שנעשה עם `GITHUB_TOKEN` לא מפעיל workflow של `on: push`**. רק `workflow_dispatch` ו-`repository_dispatch` מוחרגים ([GitHub docs](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/actions-do-not-trigger-workflows.md)). אם הסריקה תעשה commit ופריסת ה-Pages תחכה ל-push, האתר לא יתעדכן לעולם. הפתרון הפשוט: אותו workflow סורק, עושה commit, ובמשרה שנייה גם פורס.

ל-GitHub Pages שתי חולשות. הראשונה: הכותרת `Cache-Control: max-age=600` קבועה ואי אפשר לשנות אותה. השרשור בנושא פתוח מ-2022 בלי תגובה ([discussion #11884](https://github.com/orgs/community/discussions/11884)). השנייה: יש רק gzip, בלי brotli ([discussion #21655](https://github.com/orgs/community/discussions/21655)). Cloudflare מנצח בשני הדברים. ב-Workers static assets, בקשות לקבצים סטטיים **חינמיות וללא הגבלה** ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). ברירת המחדל שם היא `public, max-age=0, must-revalidate` עם `ETag` שהוא גיבוב של הקובץ, וקובץ `_headers` מאפשר כותרות לכל נתיב ([Workers static assets: Headers](https://developers.cloudflare.com/workers/static-assets/headers/)). ל-Cloudflare יש גם נקודות נוכחות בתל אביב ובחיפה. אחרי שנפתחה נקודת תל אביב, זמן התגובה החציוני למשתמשים בישראל ירד מ-86 ms ל-29 ms ([Cloudflare blog](https://medium.com/cloudflare-blog/tel-aviv-israel-cloudflares-135th-data-center-now-live-24de7fcaac49)). Cloudflare ממליצה לפרויקטים חדשים להשתמש ב-Workers ולא ב-Pages ([Cloudflare Pages](https://developers.cloudflare.com/pages/)). הפריסה נעשית מתוך אותו workflow עם `wrangler`, ולכן מלכודת ה-`GITHUB_TOKEN` לא רלוונטית. המחיר: עוד חשבון, ו-API token ששמור כ-secret. ובאתר שמתעדכן פעם ביום, ההבדל במהירות הוא עשרות מילישניות בטעינה הראשונה. זה שובר שוויון, לא שיקול מכריע.

Netlify בחינם **פסול** לאתר שמתעדכן כל יום. כל פריסה עולה 15 קרדיטים מתוך 300 בחודש. 30 פריסות הן 450 קרדיטים, והאתר יושהה באמצע עונת הרישום ([Netlify credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)). Vercel Hobby אפשרי, אבל הוא מוגבל לשימוש לא מסחרי ([סיכום תנאי Vercel](https://justinmckelvey.com/blog/is-vercel-free)), ואין לו נקודת נוכחות בישראל.

ההחלטה החשובה באמת היא הכתובת. `localStorage` שייך למקור (scheme + host + port). מעבר מ-`dolhack.github.io` לכתובת אחרת **ימחק בשקט את כל הבחירות השמורות של כל הסטודנטים**. קישורי חברים שורדים, כי ה-`#` לא נשלח לשרת ודף הפניה יכול להעביר אותו הלאה. אבל המצב השמור לא שורד. עוד פרט: כל אתרי הפרויקטים של החשבון `dolhack` חולקים את `dolhack.github.io`, ולכן גם את אותו `localStorage`. דומיין משלך מהיום הראשון הופך את המארח להחלפה בלי כאב. דומיין `.co.il` עולה בערך $29–60 לשנה ([101domain](https://www.101domain.com/co_il.htm)). `.com` זול יותר. בשם עצמו לא כדאי לשים "afeka" לבד. שם שנראה רשמי מזמין תלונה לפי כללי IL-DRP על שם "מטעה" ([ISOC-IL](https://en.isoc.org.il/il-cctld/dispute_resolution/dispute-resolution-panels)). עדיף מותג משלך, עם "לסטודנטים של אפקה" בטקסט, והבהרה גלויה שאין קשר רשמי למכללה.

## בצד המשתמש: טריות כנה, ושום בחירה לא נמחקת בשקט

שני קובצי הנתונים שוקלים 185,538 ו-167,210 בתים לפני דחיסה, ובערך 12 KB כל אחד ב-gzip. מיזעור (minify) חוסך כ-1.3 KB לקובץ אחרי דחיסה, כלומר כ-11% ([נתוני סמסטר א'](https://github.com/dolhack/lets_learn/blob/main/web/data/afeka/2027-1/30-2026.json)). זה לא מצדיק לאבד diffs קריאים ב-git. פיצול לפי קורס יהפוך 2 בקשות לעשרות. ברשת חלשה בקמפוס זה גרוע יותר, כי מספר הסבבים חשוב יותר ממספר הבתים. גם פורמט בינארי, שמות קבצים עם גיבוב ו-Workbox לא שווים את המאמץ. הכלל של ג'ייק ארצ'יבלד מתאים כאן: תוכן בלתי משתנה לכתובות שמשתנות בקלות, ואם לא, אימות מול השרת ([Caching best practices](https://github.com/jakearchibald/jakearchibald.com/blob/main/static-build/posts/2016/04/caching-best-practices/index.md)).

הבעיה האמיתית היא הטריות. היום `renderTop()` מציג אזהרה אם `fetchedAt` ישן מ-3 ימים ([ui-plan.js](https://github.com/dolhack/lets_learn/blob/main/web/ui-plan.js)). ברגע שהסורק יעשה commit רק כשיש שינוי, `fetchedAt` כבר אומר "השתנה לאחרונה", לא "נבדק לאחרונה". אז האזהרה תקפוץ סתם בימים שקטים. הפתרון הוא קובץ קטן, `status.json`, שנכתב בכל ריצה מוצלחת. יש בו `checkedAt`, `ok`, ולכל סמסטר `hash` ו-`changedAt`. האתר מציג למשל "נבדק לפני 3 שעות · השתנה לאחרונה 28/9". האזהרה מופיעה כש-`checkedAt` ישן מ-36 שעות בעונת רישום, או כשהבדיקה האחרונה נכשלה. את `status.json` מביאים עם `{cache: 'no-cache'}`. זו בקשה מותנית זעירה. על GitHub Pages אפשר לעקוף את 10 הדקות של `max-age` ואת המטמון של ה-CDN אם מביאים את הנתונים עם `?v=<hash>`. פרויקט אחר נתקל בדיוק בזה: JSON ישן "עד 10 דקות" אחרי פרסום ([OntoCanvas #55](https://github.com/alelom/OntoCanvas/issues/55)). הפתרון שלהם, `no-store`, שגוי לאפליקציה הזו, כי הוא זורק את ה-304 ואת המטמון. גם `?t=Date.now()` שגוי, מאותה סיבה. כדי לא להוסיף סבב סדרתי, מתחילים את שלוש הבקשות במקביל. מביאים שוב עם `?v=` רק אם הגיבוב ב-`status.json` שונה מהגיבוב שבתוך הנתונים.

"אין אובדן נתונים" דורש שלושה תיקונים קטנים. הראשון: מאזין `hashchange`. היום קישור חבר שמודבקים בלשונית פתוחה לא עושה כלום. זה כבר רשום כבעיה שתהיה חשובה ברגע שהאתר באוויר ([ISSUES §17b](https://github.com/dolhack/lets_learn/blob/main/docs/ISSUES.md)). הפתרון: להוציא את קריאת ה-hash מ-`init()` לפונקציה `applyHash()`, ולקרוא לה גם מהמאזין ([hashchange](https://www.javascripttutorial.net/javascript-dom/javascript-hashchange/)). השני: התאמה בכל טעינה בין המצב השמור לנתונים החדשים. קבוצה שנעלמה לא נמחקת. היא נשארת עם סימון, ומופיעה הודעה כמו "הקבוצה 02 בקורס X כבר לא קיימת בנתונים", עם קישור לבחירת קבוצה אחרת. לא מוחקים, כי קבוצה יכולה לחזור בריענון הבא אחרי תקלת סריקה. השלישי, ל-iOS: Safari מוחק את כל האחסון שסקריפטים כותבים, כולל `localStorage`, אחרי **7 ימים בלי אינטראקציה עם האתר**. אפליקציה שהותקנה למסך הבית פטורה מזה ([WebKit Tracking Prevention](https://webkit.org/tracking-prevention/)). זו הסיבה הכי טובה להוסיף בהמשך manifest ו-service worker קטן שנכתב ביד. בתוכו: precache עם גרסה ל-13 קובצי ה-shell, network-first עם timeout של כ-3 שניות לנתונים, ובאנר "גרסה חדשה זמינה · רענן" במקום `skipWaiting()` אוטומטי. כל ה-ES modules מתחלפים יחד באותה גרסה. כך נמנעת בעיית הגרסאות המעורבות שארצ'יבלד מזהיר ממנה. עד אז, אפשר לעודד את המשתמשים לשמור קישור גיבוי `#b=`.

עוד שיפור זול: לארח את הגופנים אצלנו. Google מגישה את Rubik כגופן משתנה אחד לכל כתב. לכן אירוח עצמי הוא שני קבצי woff2: עברית (9,348 בתים) ולטינית (35,348 בתים), ברישיון OFL-1.1 ([Fontsource Rubik](https://fontsource.org/fonts/rubik)). זה חוסך שני חיבורים לשרתי Google, שכואבים בקליטה חלשה. זה גם מפסיק לשלוח את כתובות ה-IP של הסטודנטים ל-Google. בית משפט בגרמניה פסק שבדיוק זה מפר פרטיות ([The Hacker News](https://thehackernews.com/2022/01/german-court-rules-websites-embedding.html)). צריך לזכור גם את Suez One, שנטען דרך `@import` ב-`web/map.css`.

## הארכיטקטורה המומלצת

**איך זה עובד:** workflow אחד בשם `refresh-deploy.yml`. בלילה הוא סורק פעם אחת את כל הסמסטרים, בקצב 2.5 שניות ועם UA מזוהה. הוא מאמת את הנתונים, וכותב רק אם הכול עבר. הוא כותב `status.json` בכל הצלחה ועושה commit רק לקבצים שהשתנו. אחר כך, במשרה שנייה, הוא פורס את `web/`. ה-workflow רץ גם על `push` לקוד ב-`web/**`, ואז הוא רק פורס. בכשל הוא פותח issue, והאתר ממשיך להגיש את הנתונים הקודמים. הדפדפן מביא את `status.json` עם `no-cache`, ואת הנתונים עם `?v=hash` כשצריך. הוא מתאים את המצב השמור לנתונים בלי למחוק כלום. בהמשך מתווספים service worker ו-manifest.

שלד ה-workflow ל-GitHub Pages. הדגל `--all-semesters`, הקובץ `.commit-msg.txt` ו-`scripts/should-run.mjs` עדיין לא קיימים. הם חלק משלב 1. לפני שמקבעים גרסאות של actions, כדאי לבדוק ב-Marketplace מה הגרסה העדכנית. וצריך לבדוק בתיעוד את התחביר המדויק של `timezone`:

```yaml
name: refresh-deploy
on:
  schedule:
    - cron: '17 0 * * *'
      timezone: 'Asia/Jerusalem'
    - cron: '47 3 * * *'          # second chance: the scheduler drops and delays runs
      timezone: 'Asia/Jerusalem'
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['web/**']
concurrency: { group: refresh-deploy, cancel-in-progress: false }

jobs:
  refresh:
    if: github.event_name != 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions: { contents: write, issues: write }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - id: gate                     # skip if checked < 12h ago, daytime in Israel, or off-season non-weekly day
        run: node scripts/should-run.mjs >> "$GITHUB_OUTPUT"
        env: { REGISTRATION: '${{ vars.REGISTRATION }}', FORCE: '${{ github.event_name == ''workflow_dispatch'' }}' }
      - if: steps.gate.outputs.run == 'true'
        run: node scripts/scrape.mjs --all-semesters --delay 2500
      - if: steps.gate.outputs.run == 'true'
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add web/data
          git diff --cached --quiet && exit 0
          git commit -F .commit-msg.txt
          git pull --rebase && git push
      - if: failure()
        env: { GH_TOKEN: '${{ github.token }}' }
        run: gh issue create --title 'Scheduled scrape failing' --body "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" || true

  deploy:
    needs: refresh
    if: always() && (needs.refresh.result == 'success' || needs.refresh.result == 'skipped')
    runs-on: ubuntu-latest
    permissions: { contents: read, pages: write, id-token: write }
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v5
        with: { ref: main }           # pick up the data commit just pushed
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with: { path: web }
      - id: d
        uses: actions/deploy-pages@v4
```

ב-Settings → Pages צריך לבחור במקור "GitHub Actions". בגרסת Cloudflare, משרת `deploy` מוחלפת ב-`cloudflare/wrangler-action` עם `command: deploy`. מוסיפים `wrangler.jsonc` עם `"assets": { "directory": "./web" }` וקובץ `web/_headers`, שבו `/data/*` מקבל `max-age=0, must-revalidate`. כל השאר זהה. אם ה-runner נחסם, משרת `refresh` עוברת ל-Task Scheduler בבית. ה-push שלו מפעיל את ה-workflow דרך `on: push`, כי זה push בזהות אנושית. לכן צריך להוסיף `web/data/**` לנתיבי ה-push. ה-workflow נשאר בשביל הפריסה וההתרעות.

## תוכנית עבודה לפי סדר

| שלב | מה עושים | למה עכשיו |
|---|---|---|
| 0. אימות | בדיקת runner אחת (סעיף הבא). קריאה ידנית של תנאי השימוש של אפקה. החלטה על דומיין ומארח. | שלוש התשובות קובעות את כל השאר. הבדיקה עולה בקשה אחת. |
| 1. סורק מנומס ובטוח | ברירת מחדל `--delay 2500` עם רעד. UA עם כתובת ומייל. timeout לכל בקשה. `Retry-After`. עצירה בחסימה שעתית ואחרי 2–3 דחיות WAF ברצף. ריצה משולבת לכל הסמסטרים. JSON דטרמיניסטי בלי חותמת זמן בתוכו. `status.json`. בדיקות בריאות שדה. בדיקת שנת המבחנים. סיכום שינויים להודעת ה-commit. | חצי מהבקשות, ושום דבר לא נכתב בכשל. כל זה נבדק מקומית לפני אוטומציה. |
| 2. workflow ופריסה | `refresh-deploy.yml` כמו בשלד. שבוע ראשון רק `workflow_dispatch` ידני, ואז מפעילים את ה-cron. issue בכשל. badge ב-README. | מעלה את האתר לאוויר. הריצה הידנית חושפת בעיות לפני שהן קורות בשתיים בלילה. |
| 3. צד לקוח | אזהרת טריות לפי `checkedAt`. `status.json` עם `no-cache`, ו-`?v=hash`. מאזין `hashchange`. התאמת קבוצות שנעלמו בלי מחיקה. אירוח עצמי של Rubik ו-Suez One. שורת "לא קשור רשמית לאפקה" ושורת יצירת קשר. | בלי זה האתר יתריע סתם, קישורים יידחו בשקט, ובחירות ייעלמו. |
| 4. ייעול אחרי 2–3 שבועות | ריענון מדורג (קל כל לילה, מלא פעם בשבוע) לפי יומן השינויים. חלונות "אסור לרוץ" סביב פתיחת רישום. אם המתזמן עדיין מאחר: טריגר חיצוני עם PAT מוגבל ו-ping של מתג אדם מת. | אחרי שיש נתונים אמיתיים על קצב השינוי, לא לפני. |
| 5. מאוחר יותר | service worker ו-manifest. "מה השתנה מאז הביקור הקודם", רק לקבוצות שלך. | הגנה מפני מחיקת האחסון ב-iOS, ועבודה בלי רשת. לא דחוף ביום הראשון. |

**מה לא לעשות.** לא Netlify Free. לא Cloudflare Workers בתור הסורק. לא runner self-hosted ב-repo ציבורי בלי נעילה מלאה. לא UA שמתחזה לדפדפן. לא בקשות במקביל. לא proxy ביתי בתשלום. לא לנסות שוב ושוב מול WAF שדוחה. לא Workbox. לא פיצול לפי קורס, לא פורמט בינארי ולא שמות קבצים עם גיבוב. לא `no-store` ולא `?t=Date.now()`. לא `skipWaiting()` אוטומטי. לא דומיין עם "afeka" בלבד. ולא להעשיר נתוני מרצים או להזין אותם למערכות AI.

## החלטות פתוחות לבעלים

| החלטה | אפשרויות | המלצה |
|---|---|---|
| מארח | GitHub Pages או Cloudflare Workers static assets | עם דומיין: GitHub Pages. אפס חשבונות חדשים, ואפשר לעבור מאוחר יותר בלי נזק. בלי דומיין: Cloudflare, כי הכתובת קבועה מהיום, ונקבל כותרות מטמון ונקודת נוכחות בישראל. |
| דומיין | `.com` זול, `.co.il` בכ-$29–60 לשנה, או בלי | לקנות, אם הכלי אמור לחיות יותר מסמסטר אחד. בלי "afeka" לבד בשם. |
| מייל לאפקה | לשלוח לפני האוטומציה, במקביל לה, או לא לשלוח | לשלוח במקביל לשלב 1, לדיקן הסטודנטים או למזכירות עם IT בעותק. לתאר מה נשלף, כמה בקשות ובאיזו שעה. לשאול אם זה בסדר, אילו שעות עדיפות, ואם יש ייצוא תקופתי. להציע לעצור מיד אם יבקשו. |
| איפה רץ הסורק | runner של GitHub, Task Scheduler בבית, או VM בירושלים | נקבע לפי בדיקת ה-runner. |
| תדירות | יומי בעונת רישום, שבועי מחוץ לה | משתנה repo בשם `REGISTRATION` שמחליפים ידנית, ורשימת תאריכי פתיחת רישום. |
| שמות מרצים ב-JSON | להשאיר או להסיר | להשאיר כמו בידיעון, בלי העשרה, עם שורת הסרה באתר. ההחלטה של הבעלים. |
| אנליטיקה | בלי, GoatCounter, או Cloudflare Web Analytics | בלי, או GoatCounter ([GoatCounter](https://www.goatcounter.com/)). לפני שמפעילים, לוודא שה-`#` לא נשלח, כי יש בו נתוני משתמש. |
| טריגר חיצוני | רק cron של GitHub, או גם cron-job.org עם PAT | להתחיל בלי, ולהוסיף אם העיכובים נמשכים בעונת רישום. |

## צעד האימות הראשון: בקשה אחת מתוך runner

לפני כל קוד אחר, מוסיפים workflow זמני ומריצים אותו ידנית פעם אחת. הוא שולח בקשה אחת לדף הפתיחה, בדיוק כמו הבקשה הראשונה של הסורק. הוא מדפיס את כתובת ה-IP של ה-runner, את קוד התשובה ואת הכותרות. ואז הוא מסווג את התוצאה:

```yaml
name: probe-yedion
on: workflow_dispatch
permissions: {}
jobs:
  probe:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo "runner IP: $(curl -s https://api.ipify.org)"
      - run: |
          set +e
          curl -sS --max-time 30 -D headers.txt -o body.html \
            -w 'HTTP %{http_code} in %{time_total}s\n' \
            -A 'afeka-scheduler/1.1 (+https://github.com/dolhack/lets_learn)' \
            'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=Enter_Search'
          echo "curl exit code: $?"
          cat headers.txt
          if grep -q 'Request Rejected' body.html; then echo '::error::WAF rejected the runner IP'; exit 1; fi
          if grep -q 'השהיית גישה זמנית' body.html; then echo '::error::throttled'; exit 1; fi
          echo "body bytes: $(wc -c < body.html)"; head -c 600 body.html
```

| מה רואים | מה זה אומר | מה עושים |
|---|---|---|
| HTTP 200, דף רגיל, בלי "Request Rejected" | ה-runner לא חסום | ריצה ידנית מלאה של הסורק (אחרי שלב 1) מתוך ה-runner, ואז הפעלת ה-cron. |
| "Request Rejected" | ה-WAF חוסם כתובות של חוות שרתים | לא לנסות שוב ושוב. לחזור על הבדיקה פעם אחת ביום אחר, כי כל ריצה מקבלת IP חדש. אם זה חוזר, Task Scheduler בבית. |
| דף החסימה בעברית | הגבלת קצב לפי IP. לא סביר בבקשה אחת | לא חד-משמעי. לחזור על הבדיקה מאוחר יותר. |
| שגיאת TLS (curl exit 60) | שרשרת תעודות חסרה, לא חסימה | להתקין את תעודת הביניים על ה-runner, כמו שעשה סורק הטכניון. |
| timeout או connection reset | כנראה חסימה ברמת חומת אש או מיקום | כמו "Request Rejected". |

הבדיקה עונה בחינם גם על שאלה שנייה. אם בכותרות אין `ETag` או `Last-Modified`, בקשות מותנות ירדו סופית מהפרק. אם יש, שווה לבדוק פעם אחת אם חוזרת תשובת 304.

## מסקנה

מה שהשתנה בהבנה הוא איפה נמצא הסיכון. רוב העבודה הטכנית כבר פתורה. הסורק כבר לא כותב כלום בכשל, הנתונים זעירים, ושני המארחים החינמיים מתאימים. אבל שלושה דברים חיצוניים, שלא בשליטת הקוד, יקבעו אם האתר יעבוד ביום הרישום. האם אפקה מקבלת בקשות מחוות שרתים. האם המתזמן של GitHub באמת יריץ את המשימה בלילה. והאם הכתובת שהסטודנטים שמרו תישאר אותה כתובת. לכל אחד מהם יש תשובה זולה: בדיקה של בקשה אחת, שתי שורות cron עם שמירת דילוג, ודומיין שנקנה לפני שהקישור הראשון מופץ.

התובנה השנייה היא ש"חסכוני" ו"מנומס" מתלכדים כאן. כל צעד שחוסך בקשות, כמו איחוד הריצות, ריענון מדורג ועצירה בחסימה הראשונה, גם מוריד את הסיכוי להיחסם וגם מחזק את עמדת תום הלב מול אפקה. לכן כדאי לתעד ב-README את הקצב, השעות וה-UA, עוד לפני ששולחים את המייל. כך גם לתשובה "לא" יהיה ממה להתחיל משא ומתן.
