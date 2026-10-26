// Turns database errors into safe, friendly HTTP errors.
// Rule: never leak table names, SQL or stack traces to the browser.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// SQLSTATE -> HTTP status. Codes starting with "P0"/"55"/"28"/"22" are raised by OUR functions.
const PG_STATUS = {
  '23505': 409, // unique_violation
  '23503': 409, // foreign_key_violation
  '23514': 400, // check_violation
  '23502': 400, // not_null_violation
  '22P02': 400, // invalid_text_representation
  '22023': 400, // invalid_parameter_value
  '22001': 400, // string_data_right_truncation
  '22003': 400, // numeric_value_out_of_range
  '28000': 401, // invalid_authorization_specification (not signed in)
  '42501': 403, // insufficient_privilege / RLS
  'P0002': 404, // no_data_found
  '55000': 409, // object_not_in_prerequisite_state (stock, status workflow)
};

// constraint name -> message a user can act on
const CONSTRAINT_MESSAGES = {
  users_email_key: 'An account with this e-mail already exists.',
  seller_profiles_store_name_key: 'That store name is already taken.',
  uq_book_seller_isbn: 'You already have a book with this ISBN.',
  uq_addresses_one_default: 'Only one default address is allowed.',
  ck_book_price: 'Price must be greater than zero.',
  ck_book_stock: 'Stock cannot be negative.',
  ck_isbn: 'ISBN must be 10 or 13 characters (digits only; ISBN-10 may end in X).',
  ck_postal: 'Postal code must be 3-12 letters, digits, spaces or dashes.',
  ck_addr_phone: 'Phone must be 7-15 digits (spaces, + and - allowed).',
  ck_user_phone: 'Phone must be 7-15 digits (spaces, + and - allowed).',
  ck_cart_qty: 'Quantity must be between 1 and 10.',
  ck_rejection_needs_reason: 'A rejection needs a reason.',
  uq_book_author_order: 'Duplicate author in the list.',
  book_authors_pkey: 'Duplicate author in the list.',
};

export function toHttpError(err) {
  if (err instanceof HttpError) return err;

  // MongoDB
  if (err?.name === 'MongoServerSelectionError' || err?.name === 'MongoNetworkError') {
    return new HttpError(503, 'The reviews service is temporarily unavailable.');
  }
  if (err?.code === 11000) return new HttpError(409, 'That record already exists.');

  // PostgreSQL
  if (typeof err?.code === 'string' && PG_STATUS[err.code]) {
    const status = PG_STATUS[err.code];
    // RAISE EXCEPTION written on purpose in our own functions/triggers: the message is meant for people
    if (err.routine === 'exec_stmt_raise' && err.code !== '42501') return new HttpError(status, err.message);
    if (err.constraint && CONSTRAINT_MESSAGES[err.constraint]) return new HttpError(status, CONSTRAINT_MESSAGES[err.constraint]);
    if (err.code === '42501' && /permission denied|row-level security/i.test(err.message)) {
      return new HttpError(403, 'You do not have permission to do that.');
    }
    if (err.constraint) return new HttpError(status, `That value breaks a data rule (${err.constraint}).`);
    if (['23505', '23503', '23502', '22P02', '22003', '22001'].includes(err.code)) {
      return new HttpError(status, 'The submitted data was not valid.');
    }
    return new HttpError(status, err.message); // raised on purpose by our own functions/triggers
  }
  return new HttpError(500, 'Something went wrong. Please try again.');
}
