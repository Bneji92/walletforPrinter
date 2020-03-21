const constants = require('ocore/constants.js');
const conf = require('ocore/conf');
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const headlessWallet = require('headless-obyte');
const cors = require('cors');
const express = require('express');
var request = require('request');
var router = express.Router();
const cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var printerUrl = "http://127.0.0.1:8082/client/paymentReceived";
const app = express();
app.use(bodyParser.json({limit : '50mb', extended: true}));
app.use(bodyParser.urlencoded({limit : '50mb', extended: true}));
app.use(cookieParser());
var jsonParser = bodyParser.json();
app.use(cors());
app.listen(3000);
console.log('listening on port 3000');
let assocDeviceAddressToPeerAddress = {};
let assocDeviceAddressToMyAddress = {};
let assocMyAddressToDeviceAddress = {};
let pairingSecrets = [];
let obj = {};
router.post('/pairingCode',jsonParser, (req, res) => {
	const pairingCode= {
		pairingCode: req.body.pairingCode,
		price: req.body.price
	}
	pairingSecrets.push(pairingCode);
	res.send(200);
});

exports.searchSecret = (searchSecret) =>{
	pairingSecrets.forEach(obj =>{
		if(obj.pairingCode === searchSecret){
			return obj;
		}
	})
}

exports.postPaymentValidation = (printerUrl) =>{
	request.post({
		headers: {'content-type' : 'application/json'},
		url:     printerUrl,
		body:    {payment: true}
	}, function(error, response, body){
	});
}

eventBus.once('headless_wallet_ready', () => {
	headlessWallet.setupChatEventHandlers();

	eventBus.on('paired', (from_address, pairing_secret) => {
		//obj = this.searchSecret(pairing_secret);
		const device = require('ocore/device.js');
		device.sendMessageToDevice(from_address, 'text', "Greate we are paired, now please send me your address");
		if(obj.pairingCode === pairing_secret){
		}
	});

	eventBus.on('text', (from_address, text) => {
		const device = require('ocore/device.js');
		text = text.trim();
		if (validationUtils.isValidAddress(text)) {
			assocDeviceAddressToPeerAddress[from_address] = text;
			device.sendMessageToDevice(from_address, 'text', 'Saved your Obyte address');
			headlessWallet.issueNextMainAddress((address) => {
				assocMyAddressToDeviceAddress[address] = from_address;
				assocDeviceAddressToMyAddress[from_address] = address;
				device.sendMessageToDevice(from_address, 'text', '[balance](byteball:' + address + '?amount=1)');
			});
		} else if (assocDeviceAddressToMyAddress[from_address]) {
			device.sendMessageToDevice(from_address, 'text', '[balance](byteball:' + assocDeviceAddressToMyAddress[from_address] + '?amount=1)');
		} else {
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
				headlessWallet.sendAllBytesFromAddress(row.address, assocDeviceAddressToPeerAddress[deviceAddress], deviceAddress, (err, unit) => {
					if(err) device.sendMessageToDevice(deviceAddress, 'text', 'Oops, there\'s been a mistake. : ' + err);

					device.sendMessageToDevice(deviceAddress, 'text', 'I sent back your payment! Unit: ' + unit);
					return true;
				})
			}
		})
	});
});


process.on('unhandledRejection', up => { throw up; });
