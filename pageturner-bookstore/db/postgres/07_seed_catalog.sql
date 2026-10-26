-- =====================================================================
-- 07_seed_catalog.sql : sample books (run AFTER the demo users exist)
-- Titles/authors are real books; ISBNs are ILLUSTRATIVE (valid check digit, not the real ones).
-- Shows: temp table, unnest WITH ORDINALITY (keeps author order), LATERAL join, INSERT..SELECT.
-- =====================================================================

CREATE TEMP TABLE seed_books (
    seller_email TEXT, isbn TEXT, title TEXT, category TEXT, price_cents INT,
    stock INT, language TEXT, description TEXT, status TEXT, authors TEXT[]
);

INSERT INTO seed_books VALUES
    ('seller1@bookstore.test', '9789300010377', 'The Hobbit', 'Fantasy', 34900, 25, 'English', 'A comfort-loving hobbit is swept into a dragon-guarded treasure quest.', 'approved', ARRAY['J.R.R. Tolkien']),
    ('seller1@bookstore.test', '9789300010742', 'A Game of Thrones', 'Fantasy', 49900, 18, 'English', 'Noble families scheme for the Iron Throne while an older threat stirs in the north.', 'approved', ARRAY['George R.R. Martin']),
    ('seller1@bookstore.test', '9789300011114', 'Harry Potter and the Philosopher''s Stone', 'Fantasy', 39900, 40, 'English', 'An orphan discovers he is a wizard and starts at a school of magic.', 'approved', ARRAY['J.K. Rowling']),
    ('seller1@bookstore.test', '9789300011480', 'The Name of the Wind', 'Fantasy', 44900, 12, 'English', 'A legendary figure recounts how he became a gifted and dangerous young magician.', 'approved', ARRAY['Patrick Rothfuss']),
    ('seller1@bookstore.test', '9789300011855', 'Dune', 'Science Fiction', 42900, 22, 'English', 'Politics, religion and ecology collide over the desert planet Arrakis.', 'approved', ARRAY['Frank Herbert']),
    ('seller1@bookstore.test', '9789300012227', 'Foundation', 'Science Fiction', 37900, 15, 'English', 'A mathematician plans to shorten the dark age after a galactic empire falls.', 'approved', ARRAY['Isaac Asimov']),
    ('seller1@bookstore.test', '9789300012593', 'The Martian', 'Science Fiction', 39900, 30, 'English', 'An astronaut stranded on Mars must engineer his own survival.', 'approved', ARRAY['Andy Weir']),
    ('seller1@bookstore.test', '9789300012968', 'Neuromancer', 'Science Fiction', 35900, 4, 'English', 'A washed-up hacker is pulled into one last job in cyberspace.', 'approved', ARRAY['William Gibson']),
    ('seller1@bookstore.test', '9789300013330', 'The Girl with the Dragon Tattoo', 'Mystery & Thriller', 42900, 14, 'English', 'A journalist and a hacker investigate a decades-old disappearance.', 'approved', ARRAY['Stieg Larsson']),
    ('seller1@bookstore.test', '9789300013705', 'And Then There Were None', 'Mystery & Thriller', 29900, 35, 'English', 'Ten strangers on an island are killed off one by one.', 'approved', ARRAY['Agatha Christie']),
    ('seller1@bookstore.test', '9789300014078', 'Gone Girl', 'Mystery & Thriller', 37900, 9, 'English', 'A wife vanishes on her anniversary and suspicion falls on her husband.', 'approved', ARRAY['Gillian Flynn']),
    ('seller1@bookstore.test', '9789300014443', 'Pride and Prejudice', 'Classics', 19900, 50, 'English', 'Wit, manners and misjudgement in the courtship of Elizabeth Bennet.', 'approved', ARRAY['Jane Austen']),
    ('seller1@bookstore.test', '9789300014818', '1984', 'Classics', 24900, 45, 'English', 'A clerk rebels against total surveillance in a totalitarian state.', 'approved', ARRAY['George Orwell']),
    ('seller1@bookstore.test', '9789300015181', 'To Kill a Mockingbird', 'Classics', 32900, 20, 'English', 'A lawyer defends an innocent man in a prejudiced small town.', 'approved', ARRAY['Harper Lee']),
    ('seller1@bookstore.test', '9789300015556', 'A Brief History of Time', 'Physics', 39900, 28, 'English', 'Black holes, the Big Bang and the nature of time for the general reader.', 'approved', ARRAY['Stephen Hawking']),
    ('seller1@bookstore.test', '9789300015921', 'Cosmos', 'Physics', 44900, 16, 'English', 'A sweeping tour of the universe and humanity''s place in it.', 'approved', ARRAY['Carl Sagan']),
    ('seller2@bookstore.test', '9789300016294', 'Introduction to Algorithms', 'Computer Science', 189900, 10, 'English', 'The standard university reference on algorithm design and analysis.', 'approved', ARRAY['Thomas H. Cormen','Charles E. Leiserson','Ronald L. Rivest','Clifford Stein']),
    ('seller2@bookstore.test', '9789300016669', 'Database System Concepts', 'Computer Science', 159900, 12, 'English', 'Relational model, SQL, transactions, storage and query processing.', 'approved', ARRAY['Abraham Silberschatz','Henry F. Korth','S. Sudarshan']),
    ('seller2@bookstore.test', '9789300017031', 'Operating System Concepts', 'Computer Science', 149900, 11, 'English', 'Processes, memory, file systems and protection in modern operating systems.', 'approved', ARRAY['Abraham Silberschatz','Peter B. Galvin','Greg Gagne']),
    ('seller2@bookstore.test', '9789300017406', 'Computer Networking: A Top-Down Approach', 'Computer Science', 139900, 8, 'English', 'Networks explained layer by layer starting from the application.', 'approved', ARRAY['James F. Kurose','Keith W. Ross']),
    ('seller2@bookstore.test', '9789300017772', 'Clean Code', 'Computer Science', 89900, 20, 'English', 'Practical habits for writing readable, maintainable software.', 'approved', ARRAY['Robert C. Martin']),
    ('seller2@bookstore.test', '9789300018144', 'The Pragmatic Programmer', 'Computer Science', 99900, 14, 'English', 'Tips and craft for working programmers.', 'approved', ARRAY['Andrew Hunt','David Thomas']),
    ('seller1@bookstore.test', '9789300018519', 'Wings of Fire', 'Biography & Memoir', 29900, 30, 'English', 'The autobiography of India''s missile scientist and former President.', 'approved', ARRAY['A.P.J. Abdul Kalam','Arun Tiwari']),
    ('seller1@bookstore.test', '9789300018885', 'Long Walk to Freedom', 'Biography & Memoir', 54900, 12, 'English', 'Mandela''s own account of his life, imprisonment and leadership.', 'approved', ARRAY['Nelson Mandela']),
    ('seller1@bookstore.test', '9789300019257', 'Steve Jobs', 'Biography & Memoir', 59900, 17, 'English', 'Biography of the Apple co-founder based on many interviews.', 'approved', ARRAY['Walter Isaacson']),
    ('seller1@bookstore.test', '9789300019622', 'Atomic Habits', 'Self-Help', 49900, 38, 'English', 'Small daily changes compound into remarkable results.', 'approved', ARRAY['James Clear']),
    ('seller1@bookstore.test', '9789300019998', 'Deep Work', 'Self-Help', 42900, 19, 'English', 'Rules for focused success in a distracted world.', 'approved', ARRAY['Cal Newport']),
    ('seller1@bookstore.test', '9789300020369', 'Ikigai', 'Self-Help', 29900, 26, 'English', 'The Japanese idea of a reason for living and a long life.', 'approved', ARRAY['Héctor García','Francesc Miralles']),
    ('seller2@bookstore.test', '9789300020734', 'Advanced Engineering Mathematics', 'Engineering', 119900, 9, 'English', 'Calculus, linear algebra and differential equations for engineers.', 'approved', ARRAY['Erwin Kreyszig']),
    ('seller2@bookstore.test', '9789300021106', 'Digital Design', 'Engineering', 69900, 13, 'English', 'Logic gates, combinational and sequential circuit design.', 'approved', ARRAY['M. Morris Mano']),
    ('seller2@bookstore.test', '9789300021472', 'Discrete Mathematics and Its Applications', 'Mathematics', 129900, 10, 'English', 'Logic, sets, graphs and counting for computer science students.', 'approved', ARRAY['Kenneth H. Rosen']),
    ('seller2@bookstore.test', '9789300021847', 'Linear Algebra Done Right', 'Mathematics', 89900, 6, 'English', 'A proof-based approach to vector spaces and linear maps.', 'approved', ARRAY['Sheldon Axler']),
    ('seller1@bookstore.test', '9789300022219', 'The Very Hungry Caterpillar', 'Children', 24900, 33, 'English', 'A caterpillar eats his way through the week and becomes a butterfly.', 'approved', ARRAY['Eric Carle']),
    ('seller1@bookstore.test', '9789300022585', 'Matilda', 'Children', 29900, 21, 'English', 'A gifted girl outwits her neglectful parents and a tyrant headmistress.', 'approved', ARRAY['Roald Dahl']),
    ('seller2@bookstore.test', '9789300022950', 'Practical PostgreSQL Tuning', 'Computer Science', 79900, 15, 'English', 'Sample listing waiting in the admin approval queue.', 'pending', ARRAY['Demo Author']),
    ('seller2@bookstore.test', '9789300023322', 'Quick Guide to NoSQL', 'Computer Science', 59900, 10, 'English', 'Sample listing that moderation rejected.', 'rejected', ARRAY['Demo Author']);

INSERT INTO authors (name)
SELECT DISTINCT a FROM seed_books, unnest(authors) AS a
ON CONFLICT (name) DO NOTHING;

INSERT INTO books (seller_id, category_id, isbn, title, description, language, price_cents, stock, status, rejection_reason)
SELECT u.user_id, c.category_id, s.isbn, s.title, s.description, s.language, s.price_cents, s.stock, s.status,
       CASE WHEN s.status = 'rejected' THEN 'ISBN could not be verified' END
  FROM seed_books s
  JOIN users u      ON u.email = s.seller_email
  JOIN categories c ON c.name  = s.category;

INSERT INTO book_authors (book_id, author_id, author_order)
SELECT b.book_id, a.author_id, x.ord
  FROM seed_books s
  JOIN books b ON b.isbn = s.isbn
  CROSS JOIN LATERAL unnest(s.authors) WITH ORDINALITY AS x(author_name, ord)
  JOIN authors a ON a.name = x.author_name;

INSERT INTO stock_movements (book_id, delta, reason, created_by)
SELECT book_id, stock, 'restock', seller_id FROM books WHERE stock > 0;
DROP TABLE seed_books;
