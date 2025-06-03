const bitcoin = require("bitcoinjs-lib");
const secp256k1 = require("secp256k1");
const fs = require("fs");

const network = bitcoin.networks.bitcoin;
const SIGHASH_ALL = bitcoin.Transaction.SIGHASH_ALL;

// Private Keys
const private_key_1 = Buffer.from("39dc0a9f0b185a2ee56349691f34716e6e0cda06a7f9707742ac113c4e2317bf", "hex");
const private_key_2 = Buffer.from("5077ccd9c558b7d04a81920d38aa11b4a9f9de3b23fab45c3ef28039920fdd6d", "hex");

// Generate Public Keys from Private Keys
const public_key_1 = Buffer.from(secp256k1.publicKeyCreate(private_key_1));
const public_key_2 = Buffer.from(secp256k1.publicKeyCreate(private_key_2));

// Redeem Script (Multisig 2-of-2 P2WSH script in hex format)
const witness_script = Buffer.from("5221032ff8c5df0bc00fe1ac2319c3b8070d6d1e04cfbf4fedda499ae7b775185ad53b21039bbc8d24f89e5bc44c5b0d1980d6658316a6b2440023117c3c03a4975b04dd5652ae", "hex");
const locktime = 0; // No locktime restriction

// Single Input Data
input_data = {
	hash: "0000000000000000000000000000000000000000000000000000000000000000",
	index: 0,
	sequence: 0xffffffff,
};

// Single Output Data
output_data = {
	address: "325UUecEQuyrTd28Xs2hvAxdAjHM7XzqVF",
	amount: 0.001 * Math.pow(10, 8),
};

// Script signature for P2SH wrapped P2WSH
const script_sig = bitcoin.script.compile([
	bitcoin.payments.p2wsh({
		redeem: bitcoin.payments.p2ms({
			m: 2,
			pubkeys: [public_key_2, public_key_1],
		}),
		network,
	}).output,
]);

// Transaction
const tx = new bitcoin.Transaction();
tx.version = 2;
tx.locktime = locktime;


// Add Input (Spending the defined UTXO)
tx.addInput(Buffer.from(input_data.hash, "hex"), input_data.index, input_data.sequence, script_sig);

// Add Output (Sending BTC to the defined address)
const outputScript = bitcoin.address.toOutputScript(output_data.address, network);
tx.addOutput(outputScript, output_data.amount);

// Compute SIGHASH for signing the transaction
const sighash = tx.hashForWitnessV0(0, witness_script, output_data.amount, SIGHASH_ALL);

// Sign the transaction using both private keys
const sig_object_1 = secp256k1.ecdsaSign(sighash, private_key_1);
const sig_object_2 = secp256k1.ecdsaSign(sighash, private_key_2);

// Convert signatures to DER format
const der_signature_1 = secp256k1.signatureExport(sig_object_1.signature);
const der_signature_2 = secp256k1.signatureExport(sig_object_2.signature);

// Append SIGHASH flag to signatures
const signature_1 = Buffer.concat([der_signature_1, Buffer.from([SIGHASH_ALL])]);
const signature_2 = Buffer.concat([der_signature_2, Buffer.from([SIGHASH_ALL])]);

// Construct Witness Stack (P2WSH requires a witness stack with signatures and witness script)
const witness_stack = [Buffer.alloc(0), signature_2, signature_1, witness_script];
tx.ins[0].witness = witness_stack;

// Save the final transaction hex to a file
fs.writeFileSync("out.txt", tx.toHex());

