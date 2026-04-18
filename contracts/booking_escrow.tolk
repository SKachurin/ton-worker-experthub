struct BookingMeta {
    bookingId: uint64
    expertTelegramId: uint64
    customerTelegramId: uint64
    slotStartUnix: uint64
    expertConfirmationDeadlineUnix: uint64
    sessionOutcomeDeadlineUnix: uint64
}

struct Parties {
    customerWallet: address
    expertWallet: address
    controllerWallet: address
}

struct Storage {
    amountNanoTon: coins

    state: uint8 = 0
    fundedAtUnix: uint64 = 0
    finalizedAtUnix: uint64 = 0

    customerRatingForExpert: uint8 = 0
    expertRatingForCustomer: uint8 = 0

    parties: Cell<Parties>
    meta: Cell<BookingMeta>
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

struct (0x1001) ExpertConfirm {}
struct (0x1002) ExpertDecline {}
struct (0x1003) FinalizeToExpert {}
struct (0x1004) RefundToCustomer {}

struct (0x2001) SetCustomerRating {
    rating: uint8
}

struct (0x2002) SetExpertRating {
    rating: uint8
}

type AllowedMessage =
    ExpertConfirm
    | ExpertDecline
    | FinalizeToExpert
    | RefundToCustomer
    | SetCustomerRating
    | SetExpertRating;

const STATE_AWAITING_FUNDING = 0;
const STATE_FUNDED_WAITING_EXPERT = 1;
const STATE_WAITING_SESSION = 2;
const STATE_PAID_TO_EXPERT = 3;
const STATE_REFUNDED_TO_CUSTOMER = 4;

fun requireController(parties: Parties, sender: address) {
    assert (sender == parties.controllerWallet) throw 1001;
}

fun requireFinalized(storage: Storage) {
    assert (
        storage.state == STATE_PAID_TO_EXPERT
        || storage.state == STATE_REFUNDED_TO_CUSTOMER
    ) throw 1501;
}

fun requireValidRating(rating: uint8) {
    assert (rating >= 1) throw 1502;
    assert (rating <= 5) throw 1503;
}

fun refundCustomer(storage: Storage, parties: Parties) {
    val msg = createMessage({
        bounce: BounceMode.NoBounce,
        value: storage.amountNanoTon,
        dest: parties.customerWallet
    });
    msg.send(SEND_MODE_REGULAR);
}

fun payExpert(storage: Storage, parties: Parties) {
    val msg = createMessage({
        bounce: BounceMode.NoBounce,
        value: storage.amountNanoTon,
        dest: parties.expertWallet
    });
    msg.send(SEND_MODE_REGULAR);
}

fun onInternalMessage(in: InMessage) {
    var storage = lazy Storage.load();
    val parties = lazy storage.parties.load();
    val meta = lazy storage.meta.load();

    if (in.body.isEmpty()) {
        if (
            storage.state == STATE_AWAITING_FUNDING
            && in.senderAddress == parties.customerWallet
            && in.valueCoins >= storage.amountNanoTon
        ) {
            storage.state = STATE_FUNDED_WAITING_EXPERT;
            storage.fundedAtUnix = blockchain.now();
            storage.save();
        }
        return;
    }

    val msg = lazy AllowedMessage.fromSlice(in.body);

    match (msg) {
        ExpertConfirm => {
            requireController(parties, in.senderAddress);
            assert (storage.state == STATE_FUNDED_WAITING_EXPERT) throw 1101;
            assert (blockchain.now() <= meta.expertConfirmationDeadlineUnix) throw 1102;

            storage.state = STATE_WAITING_SESSION;
            storage.save();
        }

        ExpertDecline => {
            requireController(parties, in.senderAddress);
            assert (storage.state == STATE_FUNDED_WAITING_EXPERT) throw 1201;

            refundCustomer(storage, parties);

            storage.state = STATE_REFUNDED_TO_CUSTOMER;
            storage.finalizedAtUnix = blockchain.now();
            storage.save();
        }

        FinalizeToExpert => {
            requireController(parties, in.senderAddress);
            assert (storage.state == STATE_WAITING_SESSION) throw 1301;

            payExpert(storage, parties);

            storage.state = STATE_PAID_TO_EXPERT;
            storage.finalizedAtUnix = blockchain.now();
            storage.save();
        }

        RefundToCustomer => {
            requireController(parties, in.senderAddress);
            assert (
                storage.state == STATE_WAITING_SESSION
                || storage.state == STATE_FUNDED_WAITING_EXPERT
            ) throw 1401;

            refundCustomer(storage, parties);

            storage.state = STATE_REFUNDED_TO_CUSTOMER;
            storage.finalizedAtUnix = blockchain.now();
            storage.save();
        }

        SetCustomerRating => {
            val ratingMsg = msg as SetCustomerRating;

            requireController(parties, in.senderAddress);
            requireFinalized(storage);
            assert (storage.customerRatingForExpert == 0) throw 1601;
            requireValidRating(ratingMsg.rating);

            storage.customerRatingForExpert = ratingMsg.rating;
            storage.save();
        }

        SetExpertRating => {
            val ratingMsg = msg as SetExpertRating;

            requireController(parties, in.senderAddress);
            requireFinalized(storage);
            assert (storage.expertRatingForCustomer == 0) throw 1701;
            requireValidRating(ratingMsg.rating);

            storage.expertRatingForCustomer = ratingMsg.rating;
            storage.save();
        }

        else => {
            throw 0xFFFF;
        }
    }
}

get fun getState(): uint8 {
    val storage = lazy Storage.load();
    return storage.state;
}

get fun getBookingId(): uint64 {
    val storage = lazy Storage.load();
    val meta = lazy storage.meta.load();
    return meta.bookingId;
}

get fun getParties(): (address, address, address) {
    val storage = lazy Storage.load();
    val parties = lazy storage.parties.load();
    return (parties.customerWallet, parties.expertWallet, parties.controllerWallet);
}

get fun getDeadlines(): (uint64, uint64, uint64) {
    val storage = lazy Storage.load();
    val meta = lazy storage.meta.load();
    return (
        meta.slotStartUnix,
        meta.expertConfirmationDeadlineUnix,
        meta.sessionOutcomeDeadlineUnix
    );
}

get fun getRatings(): (uint8, uint8) {
    val storage = lazy Storage.load();
    return (
        storage.customerRatingForExpert,
        storage.expertRatingForCustomer
    );
}