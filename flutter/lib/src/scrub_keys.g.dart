// GENERATED from shared/scrub-keys.json by scripts/sync-flutter-rules.mjs. Do not edit.

const scrubSeparators = <String>['_', '-', ' ', '.'];
const scrubExact = <String>{'accesstoken', 'apikey', 'auth', 'authorization', 'cardnumber', 'cartao', 'cnpj', 'cookie', 'cpf', 'credentials', 'creditcard', 'csrf', 'csrftoken', 'idtoken', 'ipaddress', 'passwd', 'password', 'privatekey', 'pwd', 'refreshtoken', 'remoteaddr', 'rg', 'secret', 'senha', 'session', 'sessionid', 'setcookie', 'token', 'xforwardedfor', 'xrealip', 'xsrftoken'};
const scrubContains = <String>['apikey', 'authorization', 'cardnumber', 'cookie', 'creditcard', 'passwd', 'password', 'privatekey', 'secret', 'senha', 'token'];
const scrubContainsExcept = <String, List<String>>{'token': ['tokens']};
const identifierSuffix = <String>['id'];
const identifierExact = <String>{'dist', 'endtimestamp', 'release', 'sentat', 'starttimestamp', 'timestamp'};
