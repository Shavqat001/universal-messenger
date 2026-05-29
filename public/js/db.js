const sql = require('mssql/msnodesqlv8');

const instance = process.env.MSSQL_INSTANCE
    ? `${process.env.MSSQL_HOST}\\${process.env.MSSQL_INSTANCE}`
    : process.env.MSSQL_HOST || 'localhost';

const config = {
    connectionString:
        `Driver={ODBC Driver 17 for SQL Server};` +
        `Server=${instance};` +
        `Database=${process.env.MSSQL_DATABASE || 'chat_bot'};` +
        `Trusted_Connection=yes;` +
        `MultipleActiveResultSets=False;`,
    driver: 'msnodesqlv8',
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const pool = new sql.ConnectionPool(config);

const poolConnect = pool.connect()
    .then(() => console.log('Connected to MSSQL successfully'))
    .catch(err => console.error('Error connecting to MSSQL:', JSON.stringify(err, null, 2)));

let queryCounter = 0;

async function query(queryString, params = []) {
    await poolConnect;
    const request = pool.request();
    const prefix = `q${++queryCounter}_`;
    params.forEach((val, i) => {
        const type = typeof val === 'number' ? sql.Int : sql.NVarChar(sql.MAX);
        request.input(`${prefix}${i}`, type, val);
    });
    let i = 0;
    const mssqlQuery = queryString.replace(/\?/g, () => `@${prefix}${i++}`);
    const result = await request.query(mssqlQuery);
    return result.recordset;
}

module.exports = { query, sql, pool };
