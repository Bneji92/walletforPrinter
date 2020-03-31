var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({limit : '50mb', extended: true});

/**router.post('/pairingCode',jsonParser, (req, res) => {

    let promise = Promise.resolve()
        .then(()=>{
            const pairingObject= {
                pairingCode: req.body.pairingCode,
                pairingSecret: req.body.pairingSecret,
                price: req.body.price
            }
            console.log('#########################');
            console.log('PAIRINGCODE RECEIVED WITH PAIRING OBJECT: ' + pairingObject);
            console.log('#########################');
           // pairingObjects.push(pairingObject);
        })
        .catch((e)=> {
            console.log('#########################');
            console.log('ERROR RECEIVING PAIRING OBJECT' +e);
            console.log('#########################');
            res.sendStatus(500);
        })
        .then(() =>{
            res.sendStatus(200);
        })

});
module.exports = router;*/
