const TonWeb = require("tonweb");

const tonweb = new TonWeb(new TonWeb.HttpProvider("https://testnet.toncenter.com/api/v2/jsonRPC", {
    apiKey: "f43f084474b7da0ad33da8ccca44077c788b87fd6fb670e4970e4e2f0645e65b",
}))

const getTransaction = async (address, lt, hash) => {
    return await tonweb.provider.getTransactions(address, 1);
}

// unpack Transaction: https://github.com/ton-blockchain/ton/blob/8d7f1bba7387a006e7e5a6f6eec3177d1f25b80c/crypto/block/block.tlb#L263
// transaction$0111 account_addr:bits256 lt:uint64
//   prev_trans_hash:bits256 prev_trans_lt:uint64 now:uint32
//   outmsg_cnt:uint15
//   orig_status:AccountStatus end_status:AccountStatus
//   ^[ in_msg:(Maybe ^(Message Any)) out_msgs:(HashmapE 15 ^(Message Any)) ]
//   total_fees:CurrencyCollection state_update:^(HASH_UPDATE Account)
//   description:^TransactionDescr = Transaction;
const unpackTransactionData = async (data) => {
    try {
        let res = {"description": {}};
        const buf = TonWeb.utils.base64ToBytes(data);
        const dataCell = TonWeb.boc.Cell.oneFromBoc(buf);

        // in message
        // ^[ in_msg:(Maybe ^(Message Any)) out_msgs:(HashmapE 15 ^(Message Any)) ]
        const msgsCellRef = dataCell.refs[0];
        const msgsCell = msgsCellRef.beginParse();
        const inMsgMaybe = msgsCell.loadBit();
        if (inMsgMaybe === true) {
            const inMsgCellRef = msgsCellRef.refs[0];
            res["inMsgHash"] = await inMsgCellRef.hash();
        }
        // ...

        // description
        // trans_ord$0000 credit_first:Bool
        //   storage_ph:(Maybe TrStoragePhase)
        //   credit_ph:(Maybe TrCreditPhase)
        //   compute_ph:TrComputePhase action:(Maybe ^TrActionPhase)
        //   aborted:Bool bounce:(Maybe TrBouncePhase)
        //   destroyed:Bool
        //   = TransactionDescr;
        const descriptionCellRef = dataCell.refs[2];
        const descriptionCell = descriptionCellRef.beginParse();
        res["description"]["trType"] = descriptionCell.loadInt(4);
        // ...

        return res;
    } catch (error) {
        console.error(error);
    }
}

// https://github.com/ton-blockchain/dns-contract/blob/main/func/nft-item.fc#L109
// crc32('transfer query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress custom_payload:Maybe ^Cell forward_amount:VarUInteger 16 forward_payload:Either Cell ^Cell = InternalMsgBody') = 0x5fcc3d14 & 0x7fffffff = 0x5fcc3d14
const unpackTransferMessageNftItem = async (body) => {
    try {
        let res = {};
        const buf = TonWeb.utils.base64ToBytes(body);
        const bodyCell = TonWeb.boc.Cell.oneFromBoc(buf);
        const slice = bodyCell.beginParse();
        res["op"] = slice.loadUint(32); // transfer
        res["queryId"] = slice.loadUint(64);
        res["newOwner"] = slice.loadAddress();
        res["responseDestination"] = slice.loadAddress();
        slice.loadBit() // this nft don't use custom_payload
        res["forwardAmount"] = slice.loadCoins();
        res["forwardPayload"] = bodyCell.refs[0].bits;
        return res;
    } catch (error) {
        console.error(error);
    }
}

(async () => {
    // https://testnet.tonscan.org/tx/dOBExsnU5FYe3TFiGzpfqQhmR0szB1v0sqt4EjriXts=
    const transactions = await getTransaction("EQCzjgvfKbV7ALVcKLUnLDBBPJR5fLd2_g5uDXkxYQ0La64N", "4394411000003", "dOBExsnU5FYe3TFiGzpfqQhmR0szB1v0sqt4EjriXts=")
    const data = await unpackTransactionData(transactions[0].data)
    console.log("inMsgHash:", TonWeb.utils.bytesToHex(data.inMsgHash));
    console.log("trType:", Number(data.description.trType));
    const msgData = await unpackTransferMessageNftItem(transactions[0].in_msg.msg_data.body);
    console.log("newOwner:", msgData.newOwner.toString());
    console.log("forwardAmount:", msgData.forwardAmount.toString());
    console.log("forwardPayload:", msgData.forwardPayload.toString());
})();
