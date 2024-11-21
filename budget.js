const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const { body, validationResult } = require("express-validator");
const { sortBills, sortBudgetLists } = require("./lib/sort");
const session = require("express-session");
const store = require("connect-loki");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ urlencoded: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});
app.use((req, res, next) => {
  let budgetLists = [];
  if (("budgetLists" in req.session)) {
    req.session.budgetLists.forEach(budgetList => {
      budgetLists.push(budgetList);
    });
  }
  req.session.budgetLists = budgetLists;
  next();
});

app.get("/", (req, res) => {
  res.redirect("/budget");
});

app.get("/budget", (req, res) => {
  res.render("budget-lists", {
    budgetLists: sortBudgetLists(req.session.budgetLists),
  });
});

app.get("/budget/new", (req, res) => {
  res.render("new-budget");
});

app.post("/budget/new", 
  [
    body("year")
    .trim()
    .isLength({ min: 4, max: 4 })
    .withMessage("Invalid year.")
    .isNumeric()
    .withMessage("Please enter numeric values only.")
    .bail()
    .custom((value, { req }) => {
      let re = /(?:19|20)\d{2}/;
      return value.match(re);
    })
    .withMessage("Year range should between 1900 to 2099.")
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(error => req.flash("error", error.msg));
      res.render("new-budget", {
        flash: req.flash(),
        year: req.body.year,
      });
    } else {
      req.session.budgetLists.push({
        year: req.body.year,
        month: req.body.month,
        total: 0,
      });
      req.flash("success", "New budget created.");
      res.redirect("/budget");
    }
  }
);

app.get("/budget/:budgetTitle", (req, res, next) => {
  let budgetTitle = req.params.budgetTitle;
  let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);
  if (budgetList === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("budget-detail", {
      budgetList: budgetList,
    });
  }
});

app.post("/budget/:budgetTitle", 
  [
    body("category")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Category name is required.")
    .isLength({ max: 50 })
    .withMessage("Category name must between 1 and 50 characters.")
    .isAlphanumeric()
    .withMessage("Category name contain invalid characters.")
    .custom((value, { req }) => {
      let budgetTitle = req.params.budgetTitle;
      let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);
      return !budgetList.bills.some(bill => bill.category === value);
    })
    .withMessage("Category already exists."),

    body("cost")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Cost value is required.")
    .isLength({ max: 12 })
    .withMessage("Cost value must between 1 and 12 characters.")
    .isNumeric()
    .withMessage("Cost value must be a number.")
  ],
  (req, res, next) => {
    let budgetTitle = req.params.budgetTitle;
    let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);
    if (!budgetList) {
      next(new Error("Not found."));
    } else {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(error => req.flash("error", error.msg));

        res.render("budget-detail", {
          flash: req.flash(),
          budgetList: budgetList,
          bills: budgetList.bills,
        });
      } else {
        budgetList.bills === undefined ? budgetList.bills = [{category: req.body.category, cost: req.body.cost}] : budgetList.bills.push({category: req.body.category, cost: req.body.cost});
        budgetList.total = budgetList.bills.reduce((sum, curr) => sum + (+curr.cost), 0);
        req.flash("success", "New bill added.");
        res.redirect(`/budget/${budgetTitle}`);
      }
    }
  });

  app.post("/budget/:year/total", 
    [
      body("year")
      .trim()
      .isLength({ min: 4, max: 4})
      .withMessage("Invalid year.")
      .bail()
      .custom((value, { req }) => {
        let re = /(?:19|20)\d{2}/;
        return value.match(re);
      })
      .withMessage("Year range should between 1900 to 2099.")
      .bail()
      .custom((value, { req }) => req.session.budgetLists.find(budgetList => budgetList.year === value))
      .withMessage("You don't have any budget of this year.")
    ],
    (req, res) => {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(error => req.flash("error", error.msg));
        res.render("budget-lists", {
          budgetLists: sortBudgetLists(req.session.budgetLists),
          flash: req.flash(),
          year: req.body.year,
        });
      } else {
        let total = req.session.budgetLists.filter(budgetList => budgetList.year === req.body.year)
                                           .reduce((sum, curr) => sum + (+curr.total), 0);
        res.render("budget-lists", {
          budgetLists: sortBudgetLists(req.session.budgetLists),
          year: req.body.year,
          total: total,
        });
      }
    });

app.post("/budget/:budgetTitle/delete", (req, res, next) => {
  let budgetTitle = req.params.budgetTitle;
  let budgetLists = req.session.budgetLists;
  let idx = budgetLists.findIndex(budgetList => budgetList.title === budgetTitle);

  if (idx === -1) {
    next(new Error("Not found."));
  } else {
    budgetLists.splice(idx, 1);
    req.flash("success", "Budget deleted.");
    res.redirect("/budget");
  }
});

app.post("/budget/:budgetTitle/:category/delete", (req, res, next) => {
  let category = req.params.category;
  let budgetTitle = req.params.budgetTitle;
  let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);

  if (!budgetList) {
    next(new Error("Not found."));
  } else {
    let idx = budgetList.bills.findIndex(bill => bill.category === category);

    if (idx === -1) {
      next(new Error("Not found."));
    } else {
      budgetList.bills.splice(idx, 1);
      budgetList.total = budgetList.bills.reduce((sum, curr) => sum + (+curr.cost), 0);
      req.flash("success", "Bill deleted.");
      res.redirect(`/budget/${budgetTitle}`);
    }
  }
});

app.get("/budget/:budgetTitle/:category/edit", (req, res, next) => {
  let category = req.params.category;
  let budgetTitle = req.params.budgetTitle;
  let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);

  if (!budgetList) {
    next(new Error("Not found."));
  } else {
    let bill = budgetList.bills.find(bill => bill.category === category);

    if (!bill) {
      next(new Error("Not found."));
    } else {
      res.render("bill-edit", {
        bill: bill,
        budgetList: budgetList,
      });
    }
  }
});

app.post("/budget/:budgetTitle/:category/edit", 
  [
    body("newCategory")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Category name is required.")
    .isLength({ max: 50 })
    .withMessage("Category name must between 1 and 50 characters.")
    .isAlphanumeric()
    .withMessage("Category name contain invalid characters.")
    .custom((value, { req }) => {
      let category = req.params.category;
      let budgetTitle = req.params.budgetTitle;
      let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);
      return !budgetList.bills.some(bill => bill.category === value && bill.category !== category);
    })
    .withMessage("Category already exists."),

    body("newCost")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Cost value is required.")
    .isLength({ max: 12 })
    .withMessage("Cost value must between 1 and 12 characters.")
    .isNumeric()
    .withMessage("Cost value must be a number.")
  ],
  (req, res, next) => {
    let category = req.params.category;
    let budgetTitle = req.params.budgetTitle;
    let budgetList = req.session.budgetLists.find(budgetList => budgetList.title === budgetTitle);
  
    if (!budgetList) {
      next(new Error("Not found."));
    } else {
      let bill = budgetList.bills.find(bill => bill.category === category);
  
      if (!bill) {
        next(new Error("Not found."));
      } else {
        let errors = validationResult(req);
        if (!errors.isEmpty()) {
          errors.array().forEach(error => req.flash("error", error.msg));
  
          res.render("bill-edit", {
            flash: req.flash(),
            budgetList: budgetList,
            bill: bill,
          });
        } else {
          bill.category = req.body.newCategory;
          bill.cost = req.body.newCost;
          budgetList.total = budgetList.bills.reduce((sum, curr) => sum + (+curr.cost), 0);
          req.flash("success", "Bill changed.");
          res.redirect(`/budget/${budgetTitle}`);
        }
      }
    }

  });

app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Budget is listening on port ${port} of ${host}!`);
});