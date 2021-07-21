'use strict'

const fs = require('fs'),
    fetch = require('node-fetch'),
    superagent = require('superagent'),
    readline = require("readline"),
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

rl.question('id: ', (id) => {
    if (isFinite(id)) {
        getOffer(id).then(r => global[calculateRating(r[0], r[1])])
    } else done = true
    rl.close()
})

// calculateRating(JSON.stringify(require('./cache.json')), 110)

// =====================================================================================================================

async function getOffer(id) {
    let url = `https://vstup.edbo.gov.ua/offer/${id}/`,
        maxOffer = '',
        htmlPage,
        output

    await fetch(url)
        .then(res => res.text())
        .then(body => htmlPage += body)

    let startingPoint = htmlPage.indexOf('"ox":')
    for (let i = 0; i < 4; i++) {
        if (htmlPage[startingPoint + 5 + i] !== ',') {
            maxOffer += (htmlPage[startingPoint + 5 + i])
        } else {
            break
        }
    }

    // ===

    let pages = []
    for (let i = 0; i <= 1000; i += 200) { // at "last: 1000" returns whatever is left
        pages.push(i)
    }

    for (let page of pages) {
        try {
            const request = await superagent
                .post('https://vstup.edbo.gov.ua/offer-requests/')
                .type('form')
                .set("Referer", url)
                .send({"id": id, "last": page})

            if (request.text === '{"error": "Перевищено ліміт запитів"}') {
                console.log('request limit exceeded')
                break

            } else if (request.text !== '{"requests":[]}') {
                let str = JSON.parse(request.text).requests

                if (page === 0) {
                    output = JSON.stringify(str).slice(0, -1) + ', '
                } else if ((page >= 200 || page <= 1000) && request.text !== '') {
                    output += JSON.stringify(str).slice(1).slice(0, -1) + ', '
                } else {
                    break
                }

            } else {
                break
            }

        } catch (err) {
            console.log(err)
        }
    }

    // fs.writeFileSync('./cache.json', output.slice(0, -2) + ']')
    return [output.slice(0, -2) + ']', maxOffer]
}

// =====================================================================================================================

function calculateRating(db, maxOffer) {
    db = Array.from(JSON.parse(db))

    db.forEach(
        (value, key) => {
            value.coefficient = 1

            if (typeof value.kv === 'number') {
                value.score = value.kv.toFixed(3)
            } else {
                let sum = 0, k = 1

                for (let i of value.rss) {
                    if (i.f !== undefined) { // parses "190.5 x 0.35" in two floats
                        i.kv = i.f.match(/[\d\.]+|\D+/g)[0] * i.f.match(/[\d\.]+|\D+/g)[2]
                    }

                    if (i.kv[0] === 'x') {
                        k *= +i.kv.slice(1)
                        value.coefficient = k
                    }

                    if (typeof i.kv == 'number' && value.n === key + 1) {
                        sum += +i.kv
                        value.point = sum.toFixed(3)
                    }

                    value.score = (value.point * value.coefficient).toFixed(3)
                }
            }

            value.score > 200 ? value.score = '200.000' : {}
            for (let i of value.rss) {
                i.sn === 'Квота 1' ? value.quota = 1 :
                    i.sn === 'Квота 2' ? value.quota = 2 : value.quota = 0
            }

            delete value.artid
            delete value.d
            delete value.kv
            delete value.kvi
            delete value.pa
            delete value.ptid
            delete value.rss
        })

    // ===

    db = db.filter(value => (value.prsid !== 4 || value.prsid !== 7) && value.p !== 0 && value.score >= 125)

    // prsid == 1 заява надійшла з сайту
    // prsid == 4 скасовано (втрата пріор.)
    // prsid == 5 зареєстровано
    // prsid == 6 допущено
    // prsid == 7 відмова
    // prsid == 9 рекомендовано (бюджет)

    let recommended = [],
        q1 = [],
        q2 = [],
        others = []

    db.forEach((value) => {
        if (value.prsid === 9) {
            recommended.push(value)
        } else if (value.quota !== 0) {
            if (value.quota === 1) q1.push(value)
            if (value.quota === 2) q2.push(value)
        } else others.push(value)
    })

    let q1_recommended = 0,
        q2_recommended = 0
    recommended.forEach((value) => {
        value.quota === 1 ? q1_recommended++ :
            value.quota === 2 ? q2_recommended++ : {}
    })

    recommended.sort((a, b) => a.score > b.score ? 1 : -1)
    recommended.sort((a, b) => a.p > b.p ? 1 : -1)

    q1 = sortQuotas(q1, (Math.floor(maxOffer * 0.05) > 1 ? Math.floor(maxOffer * 0.05) - q1_recommended : 1))
    q2 = sortQuotas(q2, (Math.floor(maxOffer * 0.10) > 1 ? Math.floor(maxOffer * 0.10) - q2_recommended : 1))
    q1 = q1.concat(q2)

    let quota_priority_1 = 0
    q1.forEach((value) => {
        if (value.p === 1) quota_priority_1++
    })

    function sortQuotas(q, max) {
        let savedLength = q.length

        q.sort((a, b) => a.score > b.score ? 1 : -1)
        q.sort((a, b) => a.p > b.p ? 1 : -1)

        if (q[0] !== undefined && savedLength > 1) {
            for (let i = max; i < savedLength; i++) others.push(q[i])
            q = q.slice(0, max)
        }

        return q
    }

    others.sort((a, b) => a.score > b.score ? 1 : -1)
    others.sort((a, b) => a.p > b.p ? 1 : -1)

    const list = ([]).concat(recommended, q1, others)

    // ===

    list.forEach((value, key) => {
        console.log(`score: ${value.score} | priority: ${value.p} | quota: ${value.quota} | #: ${key + 1}`)
    })

    let filtered = ([]).concat(recommended, q1.filter(value => value.p === 1), others.filter(value => value.p === 1))
    filtered.forEach((value, key) => {
        // if (key < maxOffer) console.log(`score: ${value.score} | priority: ${value.p} | quota: ${value.quota} | #: ${key + 1}`)
    })

    let noPassScore = maxOffer - recommended.length - quota_priority_1,
        noPass = others[noPassScore - 1]

    console.log('\n=================================================\n')
    console.log(`recommended: ${recommended.length}, quota: ${quota_priority_1}, others: ${noPassScore}`)
    console.log(`score: ${noPass.score} | priority: ${noPass.p} | quota: ${noPass.quota} | #: ${maxOffer}`)
}

// =====================================================================================================================

var done = (function wait() {if (!done) setTimeout(wait, 1000)})();