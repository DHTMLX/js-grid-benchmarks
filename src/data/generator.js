/**
 * What this generator produces, as a number that changes when the output does. Cached
 * datasets are keyed by it. Bump it whenever the seeded sequence moves, which is when the
 * golden hash in tests/unit/generator.test.js changes.
 */
export const GENERATOR_VERSION = 1;

/**
 * Seedable PRNG (mulberry32) for reproducible data generation.
 * Returns a function that produces a float in [0, 1) on each call.
 */
function mulberry32(seed) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The label pools every row draws from. Module scope, not per-instance getters: getItem()
// reads fifteen of them per row, and a dataset of 800 000 rows would otherwise allocate a
// fresh copy of each one every time.
const FIRST_NAMES  = ['Don', 'Doug', 'Barbara', 'James', 'Jane', 'Mary', 'Jenny', 'Karen', 'Adam', 'Melissa', 'Linda', 'Daniel', 'Lisa', 'Mike', 'John', 'David'];
const SURNAMES     = ['Taylor', 'McGregor', 'Ewans', 'Anderson', 'Davis', 'Brown', 'Jones', 'Miller', 'Johnson', 'Williams', 'Thomas', 'More', 'Jackson', 'Smith', 'Adams', 'Wilson', 'Scott'];
const CITIES       = ['London', 'Washington', 'San Francisco', 'Barcelona', 'Paris', 'Singapore', 'Dubai', 'New York', 'Chicago', 'Amsterdam'];
const COLORS       = ['Purple', 'Orange', 'Teal', 'Blue', 'Pink', 'Green', 'Red', 'Black', 'Yellow'];
const TEAMS        = ['Team A', 'Team B', 'Team C', 'Team D'];
const STATUSES     = ['Active', 'Inactive', 'Pending'];
const CURRENCIES   = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];
const DEPARTMENTS  = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Legal', 'Support', 'Product'];
const CATEGORIES   = ['Electronics', 'Clothing', 'Food', 'Furniture', 'Tools', 'Sports', 'Books', 'Toys'];
const SUPPLIERS    = ['Acme Corp', 'GlobalTech', 'FastShip', 'QualityParts', 'DirectSource', 'BestDeal'];
const WAREHOUSES   = ['WH-A', 'WH-B', 'WH-C', 'WH-D', 'WH-E'];
const REGIONS      = ['NA', 'EU', 'APAC', 'LATAM', 'MEA'];
const LANGUAGES    = ['English', 'German', 'French', 'Spanish', 'Japanese', 'Chinese', 'Korean'];
const TIMEZONES    = ['UTC', 'UTC+1', 'UTC+2', 'UTC+4', 'UTC+5', 'UTC+8', 'UTC+9', 'UTC-5', 'UTC-8'];

export class DataGenerator {
    constructor(seed = 42) {
        this.random = mulberry32(seed);
    }

    getRandomInt(min, max) { return Math.floor(this.random() * (max - min + 1) + min); }
    getRandomFloat(min, max) { return this.random() * (max - min) + min; }
    getRandomLabel(labels) { return labels[this.getRandomInt(0, labels.length - 1)]; }
    getItem(id) {
        const item = {
            id,
            firstName: this.getRandomLabel(FIRST_NAMES),
            surname:   this.getRandomLabel(SURNAMES),
            city:      this.getRandomLabel(CITIES),
            change:    this.getRandomInt(-50, 50),
            color:     this.getRandomLabel(COLORS),
            team:      this.getRandomLabel(TEAMS),
            score:     this.getRandomInt(0, 1000),
            priority:  this.getRandomInt(1, 10),
            rating:    this.getRandomInt(1, 5),
            status:    this.getRandomLabel(STATUSES),
        };

        item.salary      = this.getRandomInt(30000, 200000);
        item.bonus       = this.getRandomInt(0, 20000);
        item.budget      = this.getRandomInt(10000, 500000);
        item.revenue     = this.getRandomInt(50000, 2000000);
        item.expenses    = this.getRandomInt(20000, 1000000);
        item.profit      = this.getRandomInt(-100000, 500000);
        item.taxRate     = parseFloat(this.getRandomFloat(0, 40).toFixed(1));
        item.invoiceNum  = this.getRandomInt(10000, 99999);
        item.currency    = this.getRandomLabel(CURRENCIES);

        item.tenure       = this.getRandomInt(0, 30);
        item.absences     = this.getRandomInt(0, 30);
        item.overtime     = this.getRandomInt(0, 200);
        item.reviewScore  = this.getRandomInt(1, 10);
        item.yearsExp     = this.getRandomInt(0, 40);
        item.vacationDays = this.getRandomInt(0, 30);
        item.department   = this.getRandomLabel(DEPARTMENTS);
        item.grade        = this.getRandomInt(1, 10);
        item.officeCity   = this.getRandomLabel(CITIES);

        item.sku          = 'SKU-' + this.getRandomInt(10000, 99999);
        item.qty          = this.getRandomInt(0, 500);
        item.price        = parseFloat(this.getRandomFloat(1, 1000).toFixed(2));
        item.discount     = this.getRandomInt(0, 50);
        item.category     = this.getRandomLabel(CATEGORIES);
        item.weight       = parseFloat(this.getRandomFloat(0, 50).toFixed(2));
        item.leadDays     = this.getRandomInt(1, 30);
        item.supplier     = this.getRandomLabel(SUPPLIERS);
        item.warehouse    = this.getRandomLabel(WAREHOUSES);

        item.loginCount   = this.getRandomInt(0, 1000);
        item.errorCount   = this.getRandomInt(0, 50);
        item.responseTime = this.getRandomInt(10, 5000);
        item.daysAgo      = this.getRandomInt(0, 365);
        item.region       = this.getRandomLabel(REGIONS);
        item.language     = this.getRandomLabel(LANGUAGES);
        item.level        = this.getRandomInt(1, 10);
        item.points       = this.getRandomInt(0, 5000);
        item.timezone     = this.getRandomLabel(TIMEZONES);

        for (let i = 1; i <= 90; i++) {
            item[`col${String(i).padStart(2, '0')}`] = this.getRandomInt(100000, 999999);
        }

        return item;
    }

    generateData(count) {
        const data = [];
        for (let i = 1; i <= count; i++) data.push(this.getItem(i));
        return data;
    }
}
