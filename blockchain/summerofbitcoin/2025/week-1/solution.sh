# RPC settings
RPC_USER="alice"
RPC_PASSWORD="password"
RPC_HOST="127.0.0.1:18443"

# Helper function to make RPC calls
rpc_call() {
  local method=$1
  shift
  local params=$@

  curl -s --user $RPC_USER:$RPC_PASSWORD --data-binary "{\"jsonrpc\": \"1.0\", \"id\":\"curltest\", \"method\": \"$method\", \"params\": $params }" -H 'content-type: text/plain;' http://$RPC_HOST/
}

sleep 1

# Check Connection
info=$(rpc_call "getblockchaininfo" "[]"  | jq -c .result)
echo "CONNECTION TEST: $info"

# Create and load a new wallet
create_wallet=$(rpc_call "createwallet" "[\"testwallet\"]")
echo "WALLET CREATED: $create_wallet"

# Generate a new address in the wallet
new_address=$(rpc_call "getnewaddress" "[]" | jq .result)
echo "WALLET ADDRESS: $new_address"

# Mine 103 blocks and send the mining rewards to that new address
rpc_call "generatetoaddress" "[103, $new_address]"

# Get list of unspent transactions (first 2 UTXOs) and format as JSON
raw_transaction_inputs=$(rpc_call "listunspent" "[]" | jq -c '.result[:2] | map({txid: .txid, vout: .vout})')
echo "RAW TRANSACTION INPUTS: $raw_transaction_inputs"

# Create a hex message for OP_RETURN output
message=$(echo -n "We are all Satoshi!!" | xxd -p)
echo "SECOND OUTPUT MESSAGE: $message"

# Build outputs JSON object:
# - Send 100 BTC to the given address (i.e bcrt1qq2yshcmzdlznnpxx258xswqlmqcxjs4dssfxt2)
# - Include an OP_RETURN output with the hex message
raw_transaction_outputs=$(echo '{}' | jq -c --arg message "$message" '. + {"bcrt1qq2yshcmzdlznnpxx258xswqlmqcxjs4dssfxt2": 100, "data": $message}')
echo "RAW TRANSACTION OUTPUTS: $raw_transaction_outputs"

# Create Raw Transaction using the inputs and outputs
raw_tx_hex=$(rpc_call "createrawtransaction" "[$raw_transaction_inputs, $raw_transaction_outputs]" | jq -c '.result')
echo "RAW TRANSACTION HEX: $raw_tx_hex"

# Fund the transaction (automatically selects inputs and adds change)
funded_tx_hex=$(rpc_call "fundrawtransaction" "[$raw_tx_hex]" | jq -c '.result.hex')
echo "FUNDED TRANSACTION HEX: $funded_tx_hex"

# Sign the transaction with the wallet's private key
signed_tx_hex=$(rpc_call "signrawtransactionwithwallet" "[$funded_tx_hex]" | jq -c '.result.hex')
echo "SIGNED TRANSACTION HEX: $signed_tx_hex"

# Broadcast the transaction to the network
txid=$(rpc_call "sendrawtransaction" "[$signed_tx_hex]" | jq -r '.result')
echo "TANSACTION ID: $txid"

# Output the transaction ID to a file
echo $txid > out.txt