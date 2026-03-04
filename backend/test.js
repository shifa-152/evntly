const bcrypt = require("bcryptjs");

const hash = "$2a$12$raEp4TnpPEOcu5HPNCoFxu7FwjJzvmOd72EseglWJP6iImZ27F.SW";

bcrypt.compare("password123", hash).then(result => {
  console.log(result);
});