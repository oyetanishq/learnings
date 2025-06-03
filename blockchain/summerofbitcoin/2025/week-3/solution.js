import bitcoin, { Block, Transaction } from "bitcoinjs-lib";
import fs from "fs";
import path from "path";
import secp256k1 from "secp256k1";

const mining_difficulty = Buffer.from("0000ffff00000000000000000000000000000000000000000000000000000000", "hex"); // Mining Difficulty
const private_key = Buffer.from("39dc0a9f0b185a2ee56349691f34716e6e0cda06a7f9707742ac113c4e2317bf", "hex"); // Private key of miner
const folder = "mempool"; // Folder where unconfirmed transactions (mempool) are stored
const transactions = []; // Array of transactions to be mined
const maxFee = 24000000;
const maxWeight = 4000000;
let fee = 0;
let weight = 1000; // Assuming initial weight of coinbase transaction

/**
 * Validates a Bitcoin transaction by checking if the sum of inputs equals the sum of outputs plus the transaction fee
 *
 * @param {Transaction} transaction - The transaction object containing inputs (vin), outputs (vout), and fee
 * @returns {{isValid: boolean, transaction: Transaction | null}} Validity of the transaction, along with transaction if valid
 */
const isValidTransaction = (transaction) => {
	try {
		const inputTotal = transaction.vin.reduce((total, input) => total + input.prevout.value, 0);
		const outputTotal = transaction.vout.reduce((total, output) => total + output.value, 0);

		if (inputTotal !== outputTotal + transaction.fee) throw new Error("not valid");
		return { isValid: true, transaction: bitcoin.Transaction.fromHex(transaction.hex) };
	} catch (error) {
		return { isValid: false, transaction: null };
	}
};

fs.readdirSync(folder).forEach((file) => {
	if (!file.endsWith(".json")) return;
	const filePath = path.join(folder, file);

	const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	const { isValid, transaction } = isValidTransaction(data);

	if (isValid) {
		// Ensure adding this transaction does not exceed the maxFee and maxWeight constraints
		if (fee + data.fee < maxFee && weight + data.weight < maxWeight) {
			transactions.push(transaction);
			fee += data.fee;
			weight += data.weight;
		}
	}
});

/**
 * Convert difficulty target to compact bits format
 * @param {string} target - The target difficulty in hex format
 * @returns {number} The compact format of bits
 */
const targetToBits = (target) => {
	let targetBigInt = BigInt("0x" + target);
	let exponent = 0;

	// Calculate exponent by shifting bits right
	while (targetBigInt > BigInt(0)) {
		targetBigInt >>= BigInt(8);
		exponent++;
	}

	let coefficientBigInt = BigInt("0x" + target) >> (BigInt(8) * (BigInt(exponent) - BigInt(3)));
	if ((coefficientBigInt & BigInt(0x00800000)) !== BigInt(0)) {
		coefficientBigInt >>= BigInt(8);
		exponent++;
	}

	return Number((BigInt(exponent) << BigInt(24)) | (coefficientBigInt & BigInt(0x007fffff)));
};

/**
 * Mine a block by finding a valid nonce that satisfies proof of work
 * @param {Block} block  - The block to be mined
 * @returns {number} - The valid nonce for the block
 */
const mineBlockNonce = (block) => {
	let nonce = 0;

	// Increment nonce until a valid hash is found
	while (!block.checkProofOfWork()) {
		block.nonce = nonce;
		nonce++;
	}

	return nonce - 1;
};

/**
 * Create a coinbase transaction (first transaction in a block)
 * @param {Uint8Array} private_key - The private key used to generate the public key
 * @param {number} amount - The amount to be rewarded to the miner
 * @param {Transaction[]} transactions - The list of transactions included in the block
 * @returns {{witnessCommitment: Buffer, txHex: string}} - Witness Commitment and hex of the coinbase transaction
 */
const createCoinBaseTransaction = (private_key, amount = 0, transactions = []) => {
	const public_key = Buffer.from(secp256k1.publicKeyCreate(private_key));
	const network = bitcoin.networks.bitcoin;

	// Create a P2PKH (Pay-to-PubKey-Hash) payment script, and compile script signature
	const payment = bitcoin.payments.p2pkh({ pubkey: public_key, network });
	const script_sig = bitcoin.script.compile([payment.output]);

	// Coinbase input (mining reward transaction input)
	const input_data = {
		hash: "0000000000000000000000000000000000000000000000000000000000000000",
		index: 0,
		sequence: 0xffffffff,
	};

	// Create new transaction
	const tx = new bitcoin.Transaction();
	tx.version = 2;
	tx.locktime = 0;

	// Add the input (coinbase)
	tx.addInput(Buffer.from(input_data.hash, "hex"), input_data.index, input_data.sequence, script_sig);
	tx.ins[0].witness = [Buffer.alloc(32)]; // Empty witness data
	transactions.unshift(tx); // Add coinbase transaction at the beginning of the transactions list

	// Witness commitment
	const WITNESS_COMMITMENT_HEADER = Buffer.from("aa21a9ed", "hex");
	const witnessCommitment = bitcoin.Block.calculateMerkleRoot(transactions, true);

	// Add coinbase output (miner's reward), and witness commitment output
	tx.addOutput(bitcoin.address.toOutputScript(payment.address, network), amount);
	tx.addOutput(bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.concat([WITNESS_COMMITMENT_HEADER, witnessCommitment])]), 0);

	return { witnessCommitment, txHex: tx.toHex() };
};

// Create the coinbase transaction with the collected fee as reward
const { witnessCommitment, txHex } = createCoinBaseTransaction(private_key, fee, transactions);

// Get transaction IDs from included transactions
const txids = transactions.map((t) => t.getId());

// Create a new block
const block = new bitcoin.Block();
block.version = 4;
block.prevHash = Buffer.alloc(32, 0);
block.merkleRoot = bitcoin.Block.calculateMerkleRoot(transactions);
block.timestamp = Math.floor(new Date() / 1000);
block.bits = targetToBits(mining_difficulty.toString("hex"));
block.nonce = mineBlockNonce(block);
block.witnessCommit = witnessCommitment;

// Write the block hex, coinbase tx hex, and transactions Id's to a file
fs.writeFileSync("out.txt", `${block.toHex()}\n${txHex}\n${txids.join("\n")}`);
