/**
 * This script is used to get all incoming pairing requests, it handles or validates them, send payments and/or payment requests.
 * Pairing is matched with a secret that is generated for each pairing case and has a unique identifier.
 * Important: Change printerUrl to destination of your printer client.
 * @type {{}}
 */
var printerUrl = "http://localhost:8082/client/paymentReceived"; // should be th url for the 3D client
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const headlessWallet = require('headless-obyte');
let assocDeviceAddressToPeerAddress = {};
let assocDeviceAddressToMyAddress = {};
let assocMyAddressToDeviceAddress = {};
let pairingObjectsPayment = [];
let pairingObjectsService = [];
let secrets = [];
let paymentStable = true;
/**
 * Looks if secret is in any off the arrays. The secret is used to check whether a pairing is valid or not.
 * @param searchSecret
 * @returns {boolean}
 */
exports.searchSecret = (searchSecret) =>{
	let found = false;
	for( let i = 0; i < pairingObjectsService.length; i++ ){
		if('*'+pairingObjectsService[i].pairingSecret === searchSecret){
			found = true;
			break;
		}
	}if( found === false) {
		for( let i = 0; i < pairingObjectsPayment.length; i++ ){
			if('*'+pairingObjectsPayment[i].pairingSecret === searchSecret){
				found = true;
				break;
			}
		}
	}
	return found;
}

/**
 * POST REQUEST TO: 3D CLIENT (PRINTER BACKEND)
 * To proof payment was done.
 * @param printerUrl
 */
exports.postPaymentValidation = (printerUrl) =>{
	const request = require('request');
	request.post({
		headers: {'content-type' : 'application/json'},
		url:     printerUrl,
		body:    JSON.stringify({payment: true})
	}, function(error, response, body){
	});
}

eventBus.once('headless_wallet_ready', () => {
	headlessWallet.setupChatEventHandlers();
	eventBus.on('paired', (from_address, pairing_secret) => {
		const device = require('ocore/device.js');
		secrets.push(pairing_secret);
		if(this.searchSecret(pairing_secret)){
			console.log('#########################');
			console.log('PAIRING MATCHED')
			console.log('#########################');
			device.sendMessageToDevice(from_address, 'text', "Great we are paired, now please send me your address");
		} else {
			device.sendMessageToDevice(from_address, 'text', "We did not receive a correct pairing secret from you");
		}
	});

	eventBus.on('text', (from_address, text) => {
		const device = require('ocore/device.js');
		text = text.trim();
		if (validationUtils.isValidAddress(text)) {
			assocDeviceAddressToPeerAddress[from_address] = text;
			device.sendMessageToDevice(from_address, 'text', 'Saved your obyte address, now enter "payment" for paying an order, or "service" if you got my mail and you want to get the order ready for dispatch');
		} else if (text === 'payment') {
			headlessWallet.issueNextMainAddress((address) => {
				assocMyAddressToDeviceAddress[address] = from_address;
				assocDeviceAddressToMyAddress[from_address] = address;
				//~~pairingObjectsPayment[0].price
				device.sendMessageToDevice(from_address, 'text', '[balance](byteball:' + address + '?amount=' + 1 + ')');
			})
			this.postPaymentValidation(printerUrl);
		} else if (text === 'service') {
			if(paymentStable){
				// ~~pairingObjectsService[0].price
				headlessWallet.issueChangeAddressAndSendPayment('base',1, assocDeviceAddressToPeerAddress[from_address], from_address, (err, unit) => {
					if (err){
						// something went wrong, maybe put this payment on a retry queue
						return;
					}
					// handle successful payment
				});
			} else{
				device.sendMessageToDevice(from_address, 'text', 'The payment of the order is yet not stable, please retry later by writing "service"');
			}

		}
		else {
			device.sendMessageToDevice(from_address, 'text', "Please send me your address");
		}
	});

});

/**
 * user pays to the bot
 */
eventBus.on('new_my_transactions', (arrUnits) => {
	const device = require('ocore/device.js');
	db.query("SELECT address, amount, asset FROM outputs WHERE unit IN (?)", [arrUnits], rows => {
		rows.forEach(row => {
			let deviceAddress = assocMyAddressToDeviceAddress[row.address];
			if (row.asset === null && deviceAddress) {
				device.sendMessageToDevice(deviceAddress, 'text', 'I received your payment: ' + row.amount + ' bytes');
				this.postPaymentValidation(printerUrl);
				return true;
			}
		})
	});
});

/**
 * payment is confirmed
 */
eventBus.on('my_transactions_became_stable', (arrUnits) => {
	const device = require('ocore/device.js');
db.query("SELECT address, amount, asset FROM outputs WHERE unit IN (?)", [arrUnits], rows => {
		rows.forEach(row => {
			let deviceAddress = assocMyAddressToDeviceAddress[row.address];
			if (row.asset === null && deviceAddress) {
				paymentStable = true;
			}
		})
	});
});


process.on('unhandledRejection', up => { throw up; });

const express = require('express'), app = express(), bodyParser = require('body-parser'), cors = require('cors'), cookieParser = require('cookie-parser');
app.use(cors());
app.listen(3000);
const jsonParser = bodyParser.json();
app.use(bodyParser.json({limit : '50mb', extended: true}));
app.use(bodyParser.urlencoded({limit : '50mb', extended: true}));
app.use(cookieParser());
console.log('listening on port 3000');
/**
 * POST REQUEST FROM: 3D CLIENT (PRINTER BACKEND)
 * Api to set a new pairing code to be used if any pairing requests are incoming.
 */
app.post('/pairingCode',jsonParser, (req, res) => {
	console.log('#########################');
	console.log('INSIDE POST');
	console.log('#########################');
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
			this.sortObjects(pairingObject);
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
/**
 * Sorts the pairing objects. Sorting is important to declare whether a pairing was done for service or for payment.
 * @param pairingObject
 */
exports.sortObjects = (pairingObject) =>{
	let str = pairingObject.pairingSecret;
	let subs = str.substring(1,47);
	if(subs === 'Service'){
		pairingObjectsService.push(pairingObject);
	} else {
		pairingObjectsPayment.push(pairingObject);
	}
}
module.exports = app;
