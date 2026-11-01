#!/usr/bin/env python3
"""Builds the Chen-notation ER diagrams (DOT sources, PNG and SVG) for PageTurner.

    python docs/diagrams/make_chen.py            # writes er-chen-*.dot / .png / .svg next to this file

Everything drawn comes from db/postgres/01_schema.sql, 08_features.sql and 10_se_requirements.sql (and the MongoDB
validators in src/lib/mongo.js). Needs Graphviz (dot / neato) on PATH or in C:\\Program Files\\Graphviz\\bin.

Chen notation used
  rectangle ............ entity            double rectangle ... weak entity
  diamond .............. relationship      double diamond ..... identifying relationship of a weak entity
  ellipse .............. attribute         underlined ......... primary key (weak entity: partial key, italic)
  double ellipse ....... multivalued       dashed ellipse ..... derived attribute
  ellipse with ellipses  composite attribute
  single line .......... partial participation    double line ... total participation
  1 / N / M ............ cardinality written next to the entity it belongs to
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GV = shutil.which('neato') and os.path.dirname(shutil.which('neato')) or r'C:\Program Files\Graphviz\bin'
FONT = 'Arial'
INK = '#1f2a2e'

# colours per domain only to help reading; the notation itself is black and white
C_ENT = '#e8f1ec'
C_WEAK = '#fbefd9'
C_REL = '#e2eef5'
C_ATTR = '#ffffff'
C_NOSQL = '#f1e6f5'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class Diagram:
    def __init__(self, name, title, scale=1.0, sep='+26', layout='neato'):
        self.name, self.title, self.layout = name, title, layout
        self.lines, self.n = [], 0
        self.sep = sep
        self.scale = scale

    def uid(self, p='n'):
        self.n += 1
        return f'{p}{self.n}'

    def add(self, s):
        self.lines.append(s)

    # ---- nodes ----
    def attr(self, owner, spec, color=C_ATTR, length=1.15):
        """spec: 'name' | ('name', kind) | ('name', 'composite', [subattrs]); kind pk | partial | derived | multi"""
        if isinstance(spec, str):
            spec = (spec, 'plain')
        name, kind = spec[0], spec[1]
        a = self.uid('a')
        label = esc(name)
        if kind == 'pk':
            label = f'<U>{label}</U>'
        elif kind == 'partial':
            label = f'<I><U>{label}</U></I>'
        style = 'filled,dashed' if kind == 'derived' else 'filled'
        per = ', peripheries=2' if kind == 'multi' else ''
        self.add(f'{a} [shape=ellipse, label=<{label}>, fillcolor="{color}", style="{style}"{per}, fontsize=10, margin="0.06,0.03"];')
        self.add(f'{owner} -- {a} [len={length}, penwidth=1];')
        if kind == 'composite':
            for sub in spec[2]:
                s = self.uid('a')
                self.add(f'{s} [shape=ellipse, label="{esc(sub)}", fillcolor="{color}", style=filled, fontsize=9, margin="0.05,0.02"];')
                self.add(f'{a} -- {s} [len=0.9, penwidth=1];')
        return a

    def entity(self, key, name, attrs=(), weak=False, stub=False, color=None, big=False):
        n = f'e_{key}'
        fill = color or (C_WEAK if weak else C_ENT)
        per = ', peripheries=2' if weak else ''
        style = 'filled,dashed' if stub else 'filled'
        self.add(f'{n} [shape=box, label="{esc(name)}", fillcolor="{fill}", style="{style}"{per}, fontsize=13, fontname="{FONT} Bold", margin="0.22,0.12", penwidth=1.6{', width=3.8, height=1.7, fixedsize=true' if big else ''}];')
        for a in attrs:
            self.attr(n, a)
        return n

    def rel(self, key, name, ents, attrs=(), identifying=False, length=2.0):
        """ents: list of (entity_key, cardinality, total_participation, optional_role)"""
        r = f'r_{key}'
        per = ', peripheries=2' if identifying else ''
        self.add(f'{r} [shape=diamond, label="{esc(name)}", fillcolor="{C_REL}", style=filled{per}, fontsize=11, fontname="{FONT} Bold", margin="0.04,0.02", penwidth=1.4];')
        keys = [e[0] for e in ents]
        for i, (ek, card, total, *role) in enumerate(ents):
            lab = f'<B>{esc(card)}</B>' + (f'<BR/><I>{esc(role[0])}</I>' if role else '')
            colour = '"black:white:black"' if total else 'black'
            angle = 0
            if role and keys.count(ek) == 1:
                angle = 40
            if keys.count(ek) > 1:                       # recursive relationship: spread the two ends apart
                angle = -50 if i == keys.index(ek) else 50
            port = PORTS.get((key, ek))
            end = f'e_{ek}:{port}' if port else f'e_{ek}'
            self.add(f'{r} -- {end} [len={length}, penwidth={1.3 if total else 1.2}, color={colour}, headlabel=<{lab}>, labeldistance=2.6, labelangle={angle}, fontsize=12, fontname="{FONT}"];')
        for a in attrs:
            self.attr(r, a, color='#fffdf8', length=1.0)
        return r

    # ---- output ----
    def dot(self):
        head = (f'graph "{self.name}" {{\n'
                f'  layout={self.layout}; overlap=prism; overlap_scaling=2.2; sep="{self.sep}"; splines=true; mode=major; start=7;\n'
                f'  labelloc=t; label=<<B>{esc(self.title)}</B>>; fontsize=22; fontname="{FONT}"; pad=0.4;\n'
                f'  node [fontname="{FONT}", fontcolor="{INK}", color="{INK}"]; edge [color="{INK}"];\n')
        return head + '\n'.join('  ' + l for l in self.lines) + '\n}\n'

    def write(self, dpi=170):
        base = os.path.join(HERE, self.name)
        with open(base + '.dot', 'w', encoding='utf-8', newline='\n') as f:
            f.write(self.dot())
        exe = os.path.join(GV, 'neato.exe' if os.name == 'nt' else 'neato')
        for fmt, extra in (('png', [f'-Gdpi={dpi}']), ('svg', [])):
            subprocess.run([exe, f'-T{fmt}', *extra, base + '.dot', '-o', f'{base}.{fmt}'], check=True)
        print('wrote', self.name)


# ---------------------------------------------------------------------------------------------------------------
# attribute lists, straight from the CREATE TABLE statements
# ---------------------------------------------------------------------------------------------------------------
PK = lambda n: (n, 'pk')
DER = lambda n: (n, 'derived')

A_ROLE = [PK('role_id'), 'role_name']
A_USER = [PK('user_id'), 'name', 'email', 'password_hash', 'status', 'phone', 'failed_login_count', 'locked_until',
          'email_verified_at', 'created_at', 'updated_at']
A_PROFILE = [('store_name', 'partial'), 'description']
A_ADDRESS = [PK('address_id'), 'label', 'full_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'phone', 'is_default']
A_APP = [PK('application_id'), 'store_name', 'reason', 'status', 'review_note', 'decided_at', 'created_at']
A_TOKEN = [PK('token_hash'), 'expires_at', 'used_at', 'created_at']
A_NOTE = [PK('notification_id'), 'kind', 'subject', 'body', 'link', 'email_status', 'read_at', 'created_at']
A_CAT = [PK('category_id'), 'name']
A_AUTHOR = [PK('author_id'), 'name']
A_BOOK = [PK('book_id'), 'isbn', 'title', 'description', 'language', 'cover_url', 'price_cents', 'stock', 'low_stock_threshold',
          'status', 'rejection_reason', DER('avg_rating'), DER('review_count'), DER('search_vector'), 'created_at', 'updated_at']
A_ORDER = [PK('order_id'), 'order_number', 'status',
           ('shipping address (snapshot)', 'composite', ['ship_full_name', 'ship_line1', 'ship_line2', 'ship_city', 'ship_state',
                                                         'ship_postal_code', 'ship_country', 'ship_phone']),
           'subtotal_cents', 'tax_cents', 'shipping_cents', DER('total_cents'), 'placed_at', 'cancelled_at', 'created_at', 'updated_at']
A_ITEM = [('order_item_id', 'partial'), 'title_snapshot', 'isbn_snapshot', 'unit_price_cents', 'quantity', DER('line_total_cents'),
          'fulfilment_status', 'updated_at']
A_PAY = [('payment_id', 'partial'), 'method', 'amount_cents', 'status', 'transaction_ref', 'detail', 'paid_at']
A_MOVE = [PK('movement_id'), 'delta', 'reason', 'created_by', 'created_at']
A_AUDIT = [PK('audit_id'), 'table_name', 'record_id', 'action', 'old_data', 'new_data', 'actor_id', 'changed_at']
A_SETTING = [PK('setting_key'), 'setting_value', 'description']
PORTS = {}   # (relationship key, entity key) -> compass point, used on crowded hubs of the overview


def stub(d, key, name, pk):
    return d.entity(key, name, [PK(pk)], stub=True)


# ---------------------------------------------------------------------------------------------------------------
def users_diagram():
    PORTS.clear()
    PORTS.update({('hasprofile', 'user'): 'sw', ('decides', 'user'): 'nw', ('applies', 'user'): 'w', ('resets', 'user'): 's', ('receives', 'user'): 'se'})
    d = Diagram('er-chen-users', 'PageTurner ER (Chen): users, roles and account features')
    d.entity('user', 'User', A_USER, big=True)
    d.entity('role', 'Role', A_ROLE)
    d.entity('profile', 'Seller Profile', A_PROFILE, weak=True)
    d.entity('address', 'Address', A_ADDRESS)
    d.entity('application', 'Seller Application', A_APP)
    d.entity('everify', 'Email Verification', A_TOKEN)
    d.entity('preset', 'Password Reset', A_TOKEN)
    d.entity('note', 'Notification', A_NOTE)
    d.rel('hasrole', 'Has Role', [('user', 'N', True), ('role', '1', False)], length=3.2)
    d.rel('hasprofile', 'Has Profile', [('user', '1', False), ('profile', '1', True)], identifying=True, length=3.2)
    d.rel('saves', 'Saves', [('user', '1', False), ('address', 'N', True)], length=3.2)
    d.rel('applies', 'Applies', [('user', '1', False), ('application', 'N', True)], length=3.2)
    d.rel('decides', 'Decides', [('user', '1', False, 'admin'), ('application', 'N', False)], length=3.2)
    d.rel('verifies', 'Verifies Email', [('user', '1', False), ('everify', 'N', True)], length=3.2)
    d.rel('resets', 'Resets Password', [('user', '1', False), ('preset', 'N', True)], length=3.2)
    d.rel('receives', 'Receives', [('user', '1', False), ('note', 'N', True)], length=3.2)
    return d


def catalogue_diagram():
    PORTS.clear()
    d = Diagram('er-chen-catalogue', 'PageTurner ER (Chen): catalogue, categories and authors')
    d.entity('book', 'Book', A_BOOK)
    d.entity('category', 'Category', A_CAT)
    d.entity('author', 'Author', A_AUTHOR)
    stub(d, 'user', 'User (seller)', 'user_id')
    d.rel('sells', 'Sells', [('user', '1', False), ('book', 'N', True)])
    d.rel('belongs', 'Belongs To', [('category', '1', False), ('book', 'N', True)])
    d.rel('parent', 'Parent Of', [('category', '1', False, 'parent'), ('category', 'N', False, 'child')])
    d.rel('writtenby', 'Written By', [('book', 'M', False), ('author', 'N', False)], attrs=['author_order'])
    return d


def orders_diagram():
    PORTS.clear()
    d = Diagram('er-chen-orders', 'PageTurner ER (Chen): cart, orders, payments and stock')
    d.entity('order', 'Order', A_ORDER)
    d.entity('item', 'Order Item', A_ITEM, weak=True)
    d.entity('payment', 'Payment', A_PAY, weak=True)
    d.entity('move', 'Stock Movement', A_MOVE)
    stub(d, 'user', 'User', 'user_id')
    stub(d, 'book', 'Book', 'book_id')
    d.rel('cart', 'Adds To Cart', [('user', 'M', False), ('book', 'N', False)], attrs=['quantity', 'added_at'])
    d.rel('places', 'Places', [('user', '1', False), ('order', 'N', True)])
    d.rel('contains', 'Contains', [('order', '1', False), ('item', 'N', True)], identifying=True)
    d.rel('refers', 'Refers To', [('item', 'N', True), ('book', '1', False)])
    d.rel('fulfils', 'Fulfilled By', [('item', 'N', True), ('user', '1', False, 'seller')])
    d.rel('settled', 'Settled By', [('order', '1', False), ('payment', '1', True)], identifying=True)
    d.rel('moves', 'Moves Stock Of', [('book', '1', False), ('move', 'N', True)])
    d.rel('causedby', 'Caused By', [('move', 'N', False), ('item', '1', False)])
    return d


def other_diagram():
    PORTS.clear()
    d = Diagram('er-chen-other', 'PageTurner ER (Chen): wishlist, audit log and settings')
    stub(d, 'user', 'User', 'user_id')
    stub(d, 'book', 'Book', 'book_id')
    d.rel('wish', 'Saves To Wishlist', [('user', 'M', False), ('book', 'N', False)], attrs=['added_at'])
    d.entity('audit', 'Audit Log', A_AUDIT)
    d.entity('setting', 'App Setting', A_SETTING)
    d.add('note_audit [shape=note, fontsize=10, fillcolor="#fffdf8", style=filled, label="Written by triggers.\\nrecord_id and actor_id are plain numbers,\\nnot foreign keys, so the log\\nsurvives deletes."];')
    d.add('note_audit -- e_audit [style=dotted, len=1.2];')
    d.add('note_set [shape=note, fontsize=10, fillcolor="#fffdf8", style=filled, label="Business rules as data\\n(tax rate, shipping fee,\\nlogin lock-out)."];')
    d.add('note_set -- e_setting [style=dotted, len=1.2];')
    return d


def nosql_diagram():
    PORTS.clear()
    d = Diagram('er-chen-nosql', 'MongoDB (NoSQL, linked by book_id and user_id): not part of the relational ER')
    d.add('subgraph cluster_mongo { label=<<B>MongoDB database bookstore_nosql</B>>; style="dashed,filled"; fillcolor="#f8f1fb"; fontsize=14; color="#7a4e9c"; penwidth=2;')
    d.entity('review', 'Review (document)', [PK('_id'), 'bookId', 'userId', 'userName', 'rating', 'title', 'body',
                                             ('helpfulBy', 'multi'), DER('helpfulCount'), 'createdAt', 'updatedAt'], color=C_NOSQL)
    d.entity('view', 'Book View (event)', [PK('_id'), 'bookId', 'userId', 'at'], color=C_NOSQL)
    d.add('}')
    stub(d, 'user', 'User (PostgreSQL)', 'user_id')
    stub(d, 'book', 'Book (PostgreSQL)', 'book_id')
    d.rel('writes', 'Writes', [('user', '1', False), ('review', 'N', True)])
    d.rel('reviewed', 'Is Reviewed In', [('book', '1', False), ('review', 'N', True)])
    d.rel('viewedby', 'Views', [('user', '1', False), ('view', 'N', False)])
    d.rel('viewed', 'Is Viewed In', [('book', '1', False), ('view', 'N', True)])
    d.add('legend [shape=note, fontsize=10, fillcolor="#fffdf8", style=filled, label="The links are values only (bookId, userId):\\nno foreign key crosses the two databases.\\nbooks.avg_rating and review_count in PostgreSQL\\nare a cached summary of these reviews.\\nView events expire after 30 days (TTL index)."];')
    d.add('legend -- e_review [style=dotted, len=1.5];')
    return d


def overview_diagram():
    PORTS.clear()
    PORTS.update({('hasprofile', 'user'): 'nw', ('wish', 'user'): 'n', ('sells', 'user'): 'ne', ('decides', 'user'): 'w', ('cart', 'user'): 'e'})
    d = Diagram('er-chen-overview', 'PageTurner ER (Chen): overview, entities and relationships with key attributes only', sep='+30')
    key = lambda n: [PK(n)]
    d.entity('user', 'User', [PK('user_id'), 'email'], big=True)
    d.entity('role', 'Role', key('role_id'))
    d.entity('profile', 'Seller Profile', [('store_name', 'partial')], weak=True)
    d.entity('address', 'Address', key('address_id'))
    d.entity('application', 'Seller Application', key('application_id'))
    d.entity('everify', 'Email Verification', key('token_hash'))
    d.entity('preset', 'Password Reset', key('token_hash'))
    d.entity('note', 'Notification', key('notification_id'))
    d.entity('book', 'Book', [PK('book_id'), 'isbn'], big=True)
    d.entity('category', 'Category', key('category_id'))
    d.entity('author', 'Author', key('author_id'))
    d.entity('order', 'Order', [PK('order_id'), 'order_number'])
    d.entity('item', 'Order Item', [('order_item_id', 'partial')], weak=True)
    d.entity('payment', 'Payment', [('payment_id', 'partial')], weak=True)
    d.entity('move', 'Stock Movement', key('movement_id'))
    d.entity('audit', 'Audit Log', key('audit_id'))
    d.entity('setting', 'App Setting', key('setting_key'))
    d.add('mongo [shape=box, style="dashed,filled", fillcolor="%s", fontsize=12, fontname="%s Bold", margin="0.2,0.12", penwidth=1.6, label="MongoDB (NoSQL, linked by book_id and user_id)\\nReview, Book View: not part of the relational ER\\n(see er-chen-nosql)"];' % (C_NOSQL, FONT))
    d.add('mongo -- e_book [style=dashed, len=2.6, label="bookId"]; mongo -- e_user [style=dashed, len=2.6, label="userId"];')
    d.rel('hasrole', 'Has Role', [('user', 'N', True), ('role', '1', False)], length=3.4)
    d.rel('hasprofile', 'Has Profile', [('user', '1', False), ('profile', '1', True)], identifying=True, length=3.4)
    d.rel('saves', 'Saves', [('user', '1', False), ('address', 'N', True)], length=3.4)
    d.rel('applies', 'Applies', [('user', '1', False), ('application', 'N', True)], length=3.4)
    d.rel('decides', 'Decides', [('user', '1', False, 'admin'), ('application', 'N', False)], length=3.4)
    d.rel('verifies', 'Verifies Email', [('user', '1', False), ('everify', 'N', True)], length=3.4)
    d.rel('resets', 'Resets Password', [('user', '1', False), ('preset', 'N', True)], length=3.4)
    d.rel('receives', 'Receives', [('user', '1', False), ('note', 'N', True)], length=3.4)
    d.rel('sells', 'Sells', [('user', '1', False), ('book', 'N', True)], length=3.4)
    d.rel('belongs', 'Belongs To', [('category', '1', False), ('book', 'N', True)], length=3.4)
    d.rel('parent', 'Parent Of', [('category', '1', False, 'parent'), ('category', 'N', False, 'child')], length=3.4)
    d.rel('writtenby', 'Written By', [('book', 'M', False), ('author', 'N', False)], attrs=['author_order'], length=3.4)
    d.rel('cart', 'Adds To Cart', [('user', 'M', False), ('book', 'N', False)], attrs=['quantity', 'added_at'], length=3.4)
    d.rel('wish', 'Saves To Wishlist', [('user', 'M', False), ('book', 'N', False)], attrs=['added_at'], length=3.4)
    d.rel('places', 'Places', [('user', '1', False), ('order', 'N', True)], length=3.4)
    d.rel('contains', 'Contains', [('order', '1', False), ('item', 'N', True)], identifying=True, length=3.4)
    d.rel('refers', 'Refers To', [('item', 'N', True), ('book', '1', False)], length=3.4)
    d.rel('fulfils', 'Fulfilled By', [('item', 'N', True), ('user', '1', False, 'seller')], length=3.4)
    d.rel('settled', 'Settled By', [('order', '1', False), ('payment', '1', True)], identifying=True, length=3.4)
    d.rel('moves', 'Moves Stock Of', [('book', '1', False), ('move', 'N', True)], length=3.4)
    d.rel('causedby', 'Caused By', [('move', 'N', False), ('item', '1', False)], length=3.4)
    return d


if __name__ == '__main__':
    only = set(sys.argv[1:])
    for fn in (overview_diagram, users_diagram, catalogue_diagram, orders_diagram, other_diagram, nosql_diagram):
        d = fn()
        if not only or d.name.replace('er-chen-', '') in only:
            d.write()
